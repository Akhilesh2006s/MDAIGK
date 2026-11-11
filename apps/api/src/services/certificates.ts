import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import type { Types } from 'mongoose';
import { COLORS, ERROR_CODES } from '@mango/shared';
import { env } from '../config/env';
import { AssessmentAttempt, Certificate, CertificationLevel, Counter, School, User } from '../models';
import { localDateKey } from '../utils/dates';
import { AppError, notFound } from '../utils/errors';

type CertLevel = NonNullable<Awaited<ReturnType<typeof loadLevel>>>;

async function loadLevel(levelId: Types.ObjectId) {
  return CertificationLevel.findById(levelId).lean();
}

export interface LevelStatus {
  state: 'certified' | 'available' | 'locked';
  reason?: 'PREREQUISITE_NOT_MET' | 'CLASS_NOT_ELIGIBLE' | 'NO_ASSESSMENT';
}

export function levelStatus(level: CertLevel, studentLevelNumber: number, certifiedLevels: Set<number>): LevelStatus {
  if (certifiedLevels.has(level.level)) return { state: 'certified' };
  if (level.eligibleClassLevels?.length && !level.eligibleClassLevels.includes(studentLevelNumber)) {
    return { state: 'locked', reason: 'CLASS_NOT_ELIGIBLE' };
  }
  if (level.prerequisiteLevel && !certifiedLevels.has(level.prerequisiteLevel)) return { state: 'locked', reason: 'PREREQUISITE_NOT_MET' };
  if (!level.quizId) return { state: 'locked', reason: 'NO_ASSESSMENT' };
  return { state: 'available' };
}

/** Throws unless the student may attempt this level now. */
export async function assertCanAttempt(level: CertLevel, student: { userId: Types.ObjectId; levelNumber: number }, timezone: string) {
  const certs = await Certificate.find({ studentId: student.userId }).select('level').lean();
  const status = levelStatus(level, student.levelNumber, new Set(certs.map((c) => c.level)));
  if (status.state === 'certified') throw new AppError(409, ERROR_CODES.ALREADY_CERTIFIED, 'You already hold this certificate');
  if (status.state === 'locked') {
    throw new AppError(403, ERROR_CODES.PREREQUISITE_NOT_MET, 'This certification level is locked', { reason: status.reason });
  }
  // retake policy: limited attempts per local day
  const todayKey = localDateKey(new Date(), timezone);
  const recent = await AssessmentAttempt.find({ studentId: student.userId, certificationLevelId: level._id })
    .sort({ submittedAt: -1 })
    .limit(level.maxAttemptsPerDay ?? 3)
    .select('submittedAt')
    .lean();
  const todayCount = recent.filter((a) => localDateKey(a.submittedAt!, timezone) === todayKey).length;
  if (todayCount >= (level.maxAttemptsPerDay ?? 3)) {
    throw new AppError(429, ERROR_CODES.DAILY_LIMIT_REACHED, 'No more certification attempts today — try again tomorrow');
  }
}

async function nextCertificateNumber(year: number) {
  const c = await Counter.findOneAndUpdate({ _id: `certificate-${year}` }, { $inc: { seq: 1 } }, { upsert: true, new: true }).lean();
  return `MD-${year}-${String(c!.seq).padStart(6, '0')}`;
}

/** Issue once per (student, level). Re-checks eligibility on the server and ignores duplicate awards. */
export async function issueCertificateIfPassed(params: {
  level: CertLevel;
  attempt: { attemptId: Types.ObjectId; percent: number };
  studentId: Types.ObjectId;
  schoolId: Types.ObjectId;
}) {
  const { level, attempt, studentId, schoolId } = params;
  if (attempt.percent < (level.passPercent ?? 60)) return { passed: false as const, certificate: null };
  const existing = await Certificate.findOne({ studentId, certificationLevelId: level._id }).lean();
  if (existing) return { passed: true as const, certificate: existing };
  const [student, school] = await Promise.all([User.findById(studentId).lean(), School.findById(schoolId).lean()]);
  if (!student || !school) throw notFound('Student or school');
  try {
    const cert = await Certificate.create({
      certificateNumber: await nextCertificateNumber(new Date().getFullYear()),
      verificationCode: crypto.randomBytes(6).toString('hex').toUpperCase(),
      schoolId,
      studentId,
      certificationLevelId: level._id,
      level: level.level,
      levelTitle: level.title,
      attemptId: attempt.attemptId,
      percent: attempt.percent,
      studentDisplayName: student.name,
      schoolName: school.name,
    });
    return { passed: true as const, certificate: cert.toObject() };
  } catch (e) {
    if ((e as { code?: number }).code === 11000) {
      return { passed: true as const, certificate: await Certificate.findOne({ studentId, certificationLevelId: level._id }).lean() };
    }
    throw e;
  }
}

export function verificationUrl(code: string) {
  return `${env().PUBLIC_VERIFY_BASE_URL}/${code}`;
}

/** Renders a branded A4-landscape certificate PDF into a Buffer. */
export function renderCertificatePdf(cert: {
  certificateNumber: string;
  verificationCode: string;
  studentDisplayName: string;
  schoolName: string;
  level: number;
  levelTitle?: string | null;
  issuedAt?: Date | null;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40, info: { Title: `Mango Dude Certificate ${cert.certificateNumber}` } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;
    const H = doc.page.height;
    doc.rect(0, 0, W, H).fill(COLORS.warmIvory);
    doc.lineWidth(10).rect(20, 20, W - 40, H - 40).stroke(COLORS.forestGreen);
    doc.lineWidth(2).rect(36, 36, W - 72, H - 72).stroke(COLORS.premiumGold);
    doc.rect(36, 36, W - 72, 70).fill(COLORS.forestGreen);
    doc.fillColor(COLORS.mangoYellow).font('Helvetica-Bold').fontSize(30).text('MANGO DUDE', 0, 56, { align: 'center', width: W });
    doc.fillColor(COLORS.text).font('Helvetica').fontSize(14).text('AIGK — Experiential Learning Partner', 0, 128, { align: 'center', width: W });
    doc.fillColor(COLORS.premiumGold).font('Helvetica-Bold').fontSize(34).text('Certificate of Achievement', 0, 160, { align: 'center', width: W });
    doc.fillColor(COLORS.text).font('Helvetica').fontSize(15).text('This certifies that', 0, 220, { align: 'center', width: W });
    doc.fillColor(COLORS.forestGreen).font('Helvetica-Bold').fontSize(32).text(cert.studentDisplayName, 0, 245, { align: 'center', width: W });
    doc.fillColor(COLORS.text).font('Helvetica').fontSize(15).text(`of ${cert.schoolName}`, 0, 290, { align: 'center', width: W });
    doc.text('has successfully completed', 0, 320, { align: 'center', width: W });
    doc.fillColor(COLORS.forestGreen).font('Helvetica-Bold').fontSize(22)
      .text(`Certification Level ${cert.level}${cert.levelTitle ? ` — ${cert.levelTitle}` : ''}`, 0, 345, { align: 'center', width: W });
    const issued = (cert.issuedAt ?? new Date()).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.fillColor(COLORS.text).font('Helvetica').fontSize(12);
    doc.text(`Issue date: ${issued}`, 70, H - 120);
    doc.text(`Certificate No: ${cert.certificateNumber}`, 70, H - 102);
    doc.text(`Verification: ${cert.verificationCode}`, W - 370, H - 120, { width: 300, align: 'right' });
    doc.fontSize(9).fillColor(COLORS.textMuted).text(verificationUrl(cert.verificationCode), W - 470, H - 102, { width: 400, align: 'right' });
    doc.end();
  });
}
