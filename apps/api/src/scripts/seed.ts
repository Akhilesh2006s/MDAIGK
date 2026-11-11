/**
 * Seed script.
 *   npm run seed            → upsert reference data (classes, subjects, games, programmes, plans,
 *                             certification levels, sample content) and create demo schools if none exist.
 *   npm run seed -- --reset → DROP every collection in the database first, then seed. Development only.
 *
 * Demo login credentials are listed in docs/DEMO_ACCOUNTS.md. Change them before any real use.
 */
import mongoose, { Types } from 'mongoose';
import { CLASS_LEVELS, GAMES, NEWS_CATEGORIES, PROGRAMMES, ROLES, SUBJECTS } from '@mango/shared';
import { env } from '../config/env';
import { connectDb } from '../db/connect';
import { syncIndexes } from '../db/indexes';
import {
  Activity,
  ActivityCompletion,
  AssessmentAttempt,
  Certificate,
  CertificationLevel,
  ClassLevel,
  ClassSection,
  Game,
  GameAttempt,
  LearningItem,
  LearningProgress,
  NewsArticle,
  PlatformSettings,
  Programme,
  ProgrammeEnrolment,
  Quiz,
  School,
  SchoolMembership,
  SchoolProgrammeEntitlement,
  SchoolSubscription,
  StudentProfile,
  Subject,
  SubscriptionPlan,
  TeacherAssignment,
  User,
} from '../models';
import { hashPassword } from '../routes/auth';
import { setClassAccess } from '../services/access';
import { snapshotQuizVersion } from '../services/quiz';
import { localDateKey } from '../utils/dates';

export const DEMO = {
  superAdmin: { email: 'admin@mangodude.in', password: 'MangoAdmin@2026' },
  schoolAdminPassword: 'SchoolAdmin@2026',
  teacherPassword: 'Teacher@2026',
  studentPin: '1234',
};

type Q = { prompt: string; options: string[]; correctIndex: number; explanation?: string };

// ------------------------------------------------------------------ question banks
const BANK: Record<string, Q[]> = {
  ENG: [
    { prompt: 'Which word is a noun?', options: ['Run', 'Happy', 'Garden', 'Quickly'], correctIndex: 2, explanation: 'A noun names a person, place or thing.' },
    { prompt: 'Choose the correct spelling.', options: ['Beautifull', 'Beautiful', 'Beutiful', 'Beautyful'], correctIndex: 1 },
    { prompt: 'What is the opposite of "brave"?', options: ['Bold', 'Fearful', 'Strong', 'Kind'], correctIndex: 1 },
    { prompt: 'Pick the correct sentence.', options: ['She go to school.', 'She goes to school.', 'She going to school.', 'She gone to school.'], correctIndex: 1 },
    { prompt: 'A synonym of "big" is…', options: ['Tiny', 'Large', 'Short', 'Thin'], correctIndex: 1 },
  ],
  MATH: [
    { prompt: 'What is 7 × 8?', options: ['54', '56', '64', '48'], correctIndex: 1 },
    { prompt: 'What is 125 + 375?', options: ['500', '490', '510', '450'], correctIndex: 0 },
    { prompt: 'Which is the largest fraction?', options: ['1/2', '1/3', '3/4', '2/5'], correctIndex: 2 },
    { prompt: 'How many sides does a hexagon have?', options: ['5', '6', '7', '8'], correctIndex: 1 },
    { prompt: '81 ÷ 9 = ?', options: ['7', '8', '9', '11'], correctIndex: 2 },
  ],
  SCI: [
    { prompt: 'Which planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter', 'Saturn'], correctIndex: 1 },
    { prompt: 'Plants make food by…', options: ['Respiration', 'Photosynthesis', 'Digestion', 'Evaporation'], correctIndex: 1 },
    { prompt: 'Water boils at what temperature at sea level?', options: ['50°C', '90°C', '100°C', '120°C'], correctIndex: 2 },
    { prompt: 'Which gas do we breathe out?', options: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Helium'], correctIndex: 2 },
    { prompt: 'The force that pulls objects to the Earth is…', options: ['Magnetism', 'Friction', 'Gravity', 'Electricity'], correctIndex: 2 },
  ],
  AICS: [
    { prompt: 'What does "AI" stand for?', options: ['Automatic Internet', 'Artificial Intelligence', 'Advanced Input', 'Active Information'], correctIndex: 1 },
    { prompt: 'Which of these is an input device?', options: ['Monitor', 'Printer', 'Keyboard', 'Speaker'], correctIndex: 2 },
    { prompt: 'A step-by-step set of instructions is called…', options: ['An algorithm', 'A virus', 'A browser', 'A pixel'], correctIndex: 0 },
    { prompt: 'Which is a safe online habit?', options: ['Sharing passwords', 'Using strong passwords', 'Clicking unknown links', 'Posting your address'], correctIndex: 1 },
    { prompt: 'The "brain" of a computer is the…', options: ['CPU', 'Mouse', 'Screen', 'Cable'], correctIndex: 0 },
  ],
  SPORTS: [
    { prompt: 'How many players are on a cricket team on the field?', options: ['9', '10', '11', '12'], correctIndex: 2 },
    { prompt: 'Which sport uses a shuttlecock?', options: ['Tennis', 'Badminton', 'Squash', 'Hockey'], correctIndex: 1 },
    { prompt: 'The Olympic Games are held every…', options: ['2 years', '3 years', '4 years', '5 years'], correctIndex: 2 },
    { prompt: 'What is India’s national sport commonly cited as?', options: ['Cricket', 'Hockey', 'Kabaddi', 'Football'], correctIndex: 1 },
    { prompt: 'A marathon is about how long?', options: ['10 km', '21 km', '42 km', '100 km'], correctIndex: 2 },
  ],
  SST: [
    { prompt: 'What is the capital of India?', options: ['Mumbai', 'Kolkata', 'New Delhi', 'Chennai'], correctIndex: 2 },
    { prompt: 'Which river is the longest in India?', options: ['Yamuna', 'Ganga', 'Godavari', 'Narmada'], correctIndex: 1 },
    { prompt: 'India’s Constitution came into effect in…', options: ['1947', '1950', '1952', '1962'], correctIndex: 1 },
    { prompt: 'The Taj Mahal is in which city?', options: ['Agra', 'Jaipur', 'Delhi', 'Lucknow'], correctIndex: 0 },
    { prompt: 'How many states does India have (2024)?', options: ['25', '28', '29', '30'], correctIndex: 1 },
  ],
};

const LESSONS: Record<string, Array<{ type: string; title: string; description: string; body: string }>> = {
  ENG: [
    { type: 'vocabulary', title: 'New Words: Nature', description: 'Learn five new words about nature.', body: 'Meadow — a field of grass and flowers.\nCanopy — the top layer of a forest.\nBreeze — a gentle wind.\nPebble — a small smooth stone.\nDew — tiny drops of water on grass in the morning.' },
    { type: 'story', title: 'The Clever Crow', description: 'A short story about thinking smart.', body: 'A thirsty crow found a pot with a little water at the bottom. It dropped pebbles one by one until the water rose high enough to drink. Lesson: where there is a will, there is a way.' },
    { type: 'concept', title: 'Nouns and Verbs', description: 'Naming words and action words.', body: 'Nouns name people, places and things (girl, school, ball). Verbs show action (run, jump, read).' },
  ],
  MATH: [
    { type: 'concept', title: 'Multiplication Tricks', description: 'Multiply faster with patterns.', body: 'To multiply by 9, multiply by 10 and subtract the number: 9 × 7 = 70 − 7 = 63.' },
    { type: 'puzzle', title: 'Magic Squares', description: 'Rows, columns and diagonals with equal sums.', body: 'Fill a 3×3 grid with 1–9 so each row, column and diagonal adds to 15.' },
    { type: 'practice', title: 'Mental Maths Warm-up', description: 'Ten quick sums.', body: 'Try: 25+17, 64−29, 12×4, 81÷9, 45+55 …' },
  ],
  SCI: [
    { type: 'experiment', title: 'Floating and Sinking', description: 'Which objects float in water?', body: 'Collect a coin, a leaf, a plastic lid and a stone. Predict, then test in a bowl of water. Record what floats.' },
    { type: 'concept', title: 'The Water Cycle', description: 'Evaporation, condensation and precipitation.', body: 'The sun heats water, which evaporates, forms clouds by condensation and falls back as rain.' },
    { type: 'reading', title: 'Our Solar System', description: 'Eight planets around the Sun.', body: 'Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus and Neptune orbit the Sun.' },
  ],
  AICS: [
    { type: 'concept', title: 'What is AI?', description: 'How machines learn from examples.', body: 'Artificial Intelligence lets computers learn patterns from data — like recognising a cat after seeing many cat pictures.' },
    { type: 'practice', title: 'Write an Algorithm', description: 'Steps to brush your teeth.', body: 'Write clear, ordered steps. Computers follow instructions exactly!' },
    { type: 'reading', title: 'Staying Safe Online', description: 'Digital citizenship basics.', body: 'Never share passwords, think before you click, and tell an adult if something online feels wrong.' },
  ],
  SPORTS: [
    { type: 'reading', title: 'Rules of Kabaddi', description: 'A traditional Indian sport.', body: 'Two teams of seven. A raider tags opponents while chanting "kabaddi" in one breath.' },
    { type: 'reading', title: 'Famous Athletes of India', description: 'Inspiring sports stars.', body: 'Learn about champions in athletics, badminton, cricket, hockey and chess.' },
    { type: 'concept', title: 'Warm-up and Stretching', description: 'Why warm-ups matter.', body: 'Warm muscles are less likely to get injured. Always stretch gently before play.' },
  ],
  SST: [
    { type: 'reading', title: 'Rivers of India', description: 'Lifelines of the land.', body: 'The Ganga, Brahmaputra, Godavari and Krishna support farming, cities and wildlife.' },
    { type: 'concept', title: 'Our Constitution', description: 'Rights and duties.', body: 'The Constitution of India came into effect on 26 January 1950. It lists our rights and duties.' },
    { type: 'reading', title: 'Monuments and Heritage', description: 'Stories in stone.', body: 'From the Taj Mahal to Hampi, India’s monuments tell stories of art and history.' },
  ],
};

async function makeQuiz(title: string, context: string, questions: Q[], extra: Record<string, unknown> = {}) {
  const quiz = await Quiz.create({ title, context, questions: questions.map((q) => ({ ...q, marks: 1 })), status: 'published', version: 1, ...extra });
  await snapshotQuizVersion(quiz._id);
  return quiz;
}

const rotate = <T>(arr: T[], n: number) => arr.map((_, i) => arr[(i + n) % arr.length]);

// ------------------------------------------------------------------ reference data
export async function seedReference() {
  for (const n of CLASS_LEVELS) await ClassLevel.updateOne({ levelNumber: n }, { $set: { displayName: `Class ${n}` } }, { upsert: true });
  for (const [i, s] of SUBJECTS.entries()) {
    await Subject.updateOne({ code: s.code }, { $setOnInsert: { name: s.name, description: s.scope, icon: s.icon, displayOrder: i, enabled: true, classLevels: [...CLASS_LEVELS] } }, { upsert: true });
  }
  for (const g of GAMES) {
    const config =
      g.code === 'SPELL_MASTER'
        ? { words: ['apple', 'garden', 'elephant', 'beautiful', 'science', 'library', 'mountain', 'rainbow', 'computer', 'champion'], rounds: 5 }
        : g.code === 'GRAMMAR_FIXES'
          ? {
              sentences: [
                { wrong: 'She go to school every day.', options: ['She goes to school every day.', 'She going to school every day.'], correctIndex: 0 },
                { wrong: 'They was playing football.', options: ['They were playing football.', 'They is playing football.'], correctIndex: 0 },
                { wrong: 'I has a red pen.', options: ['I have a red pen.', 'I haves a red pen.'], correctIndex: 0 },
                { wrong: 'He don’t like milk.', options: ['He doesn’t like milk.', 'He not like milk.'], correctIndex: 0 },
              ],
            }
          : g.code === 'MATH_SPRINT'
            ? { durationSec: 60, operations: ['+', '-', '×'], maxOperand: 20 }
            : { target: 2048, size: 4 };
    await Game.updateOne({ code: g.code }, { $setOnInsert: { name: g.name, description: g.description, subjectCode: g.subjectCode, enabled: true, dailyLimit: 2, config, classLevels: [...CLASS_LEVELS] } }, { upsert: true });
  }
  const subjects = await Subject.find().lean();
  const subjectByCode = new Map(subjects.map((s) => [s.code, s]));

  // Programmes with modules (programme quizzes for the first module)
  for (const [i, p] of PROGRAMMES.entries()) {
    if (await Programme.exists({ code: p.code })) continue;
    const quiz = await makeQuiz(`${p.name}: Module 1 check`, 'programme', rotate(BANK[p.code === 'YOUNG_SCIENTIST' ? 'SCI' : p.code === 'AI_ACADEMY' ? 'AICS' : p.code === 'HEALTH_ACADEMY' ? 'SPORTS' : 'MATH'], i).slice(0, 3));
    await Programme.create({
      code: p.code,
      name: p.name,
      description: p.description,
      premium: p.premium,
      displayOrder: i,
      status: 'published',
      classLevels: [...CLASS_LEVELS],
      modules: [
        {
          title: 'Getting Started',
          order: 1,
          description: `Introduction to ${p.name}`,
          items: [
            { title: 'Welcome lesson', type: 'lesson', content: `Welcome to ${p.name}! ${p.description}` },
            { title: 'First activity', type: 'activity', content: 'Try this hands-on activity and note what you discover.' },
            { title: 'Module check', type: 'quiz', quizId: quiz._id },
          ],
        },
        {
          title: 'Going Deeper',
          order: 2,
          items: [
            { title: 'Core ideas', type: 'lesson', content: 'Explore the big ideas with examples.' },
            { title: p.code === 'YOUNG_SCIENTIST' ? 'Observation journal' : 'Challenge', type: p.code === 'YOUNG_SCIENTIST' ? 'experiment' : 'activity', content: 'Complete the challenge and share with your teacher.' },
          ],
        },
      ],
    });
  }

  // Learning items + quizzes per subject
  if (!(await LearningItem.exists({}))) {
    for (const s of SUBJECTS) {
      const subj = subjectByCode.get(s.code)!;
      for (const [i, l] of LESSONS[s.code].entries()) {
        const quiz = await makeQuiz(`${l.title} — Quick Quiz`, 'learning', rotate(BANK[s.code], i).slice(0, 4), { subjectId: subj._id, classLevels: [...CLASS_LEVELS] });
        await LearningItem.create({ ...l, subjectId: subj._id, classLevels: [...CLASS_LEVELS], status: 'published', publishedAt: new Date(), quizId: quiz._id, estimatedMinutes: 10, instructions: 'Read carefully, then take the quick quiz.' });
      }
      // a practice quiz teachers can assign
      await makeQuiz(`${s.name} Practice Set`, 'activity', BANK[s.code], { subjectId: subj._id, classLevels: [...CLASS_LEVELS] });
    }
  }

  // News: one or two per category
  if (!(await NewsArticle.exists({}))) {
    const samples: Record<string, Array<[string, string]>> = {
      NATIONAL: [['New nature reserve opens for students', 'A new reserve lets school groups learn about local birds and plants.']],
      INTERNATIONAL: [['Countries agree to protect ocean life', 'Nations signed an agreement to keep oceans clean and safe for sea creatures.']],
      SCIENCE_SPACE: [['A new moon mission is planned', 'Scientists are preparing a mission to study the Moon’s south pole.'], ['Why is the sky blue?', 'Sunlight scatters in the air — blue light scatters the most.']],
      TECH_AI: [['AI helps farmers spot plant disease', 'Phone cameras and AI can now warn farmers about sick crops early.']],
      SPORTS_ENT: [['Young chess stars shine', 'Indian juniors won several medals at an international chess event.']],
      ENVIRONMENT: [['Schools start plastic-free week', 'Students across the country are swapping plastic for cloth and steel.']],
      BUSINESS: [['What is a budget?', 'A budget is a plan for how to use money — families, companies and governments all make one.']],
      HEALTH_SOCIETY: [['Why sleep matters', 'Children need 9–11 hours of sleep to grow, learn and stay healthy.']],
    };
    const sci = BANK.SCI;
    for (const c of NEWS_CATEGORIES) {
      for (const [j, [title, summary]] of samples[c.code].entries()) {
        const quiz = j === 0 ? await makeQuiz(`${title} — GK quiz`, 'news', rotate(sci, j).slice(0, 3)) : null;
        await NewsArticle.create({
          category: c.code,
          title,
          summary,
          body: `${summary}\n\nThis is a sample article for the Mango Dude demo. Replace with licensed, age-appropriate content approved by the content owner.`,
          status: 'published',
          featured: j === 0 && c.code === 'SCIENCE_SPACE',
          publishAt: new Date(Date.now() - Math.floor(Math.random() * 10) * 86400000),
          targetClasses: [...CLASS_LEVELS],
          quizId: quiz?._id,
        });
      }
    }
  }

  // Certification levels 1–10
  if (!(await CertificationLevel.exists({}))) {
    const codes = Object.keys(BANK);
    for (const level of CLASS_LEVELS) {
      const qs = codes.map((c, i) => BANK[c][(level + i) % BANK[c].length]);
      const quiz = await makeQuiz(`Certification Level ${level} Assessment`, 'certification', qs);
      await CertificationLevel.create({
        level,
        title: ['Explorer', 'Discoverer', 'Thinker', 'Achiever', 'Scholar', 'Innovator', 'Champion', 'Expert', 'Master', 'Legend'][level - 1],
        description: `Mango Dude general-knowledge certification, level ${level}.`,
        eligibleClassLevels: [...CLASS_LEVELS],
        prerequisiteLevel: level > 1 ? level - 1 : undefined,
        quizId: quiz._id,
        passPercent: 60,
        maxAttemptsPerDay: 3,
        status: 'published',
      });
    }
  }

  // Plans
  const plans = [
    { name: 'Basic', description: 'Classes 1–5, core learning, news and games', maxClassLevel: 5, programmeCodes: ['YOUNG_SCIENTIST'] },
    { name: 'Pro', description: 'Classes 1–8 with AI Academy and Young Scientist', maxClassLevel: 8, programmeCodes: ['AI_ACADEMY', 'YOUNG_SCIENTIST'] },
    { name: 'Premium', description: 'Classes 1–10 with all premium academies', maxClassLevel: 10, programmeCodes: PROGRAMMES.map((p) => p.code) },
  ];
  for (const p of plans) await SubscriptionPlan.updateOne({ name: p.name }, { $setOnInsert: { ...p, status: 'active' } }, { upsert: true });

  await PlatformSettings.updateOne({ key: 'platform' }, { $setOnInsert: { platformName: 'Mango Dude', supportEmail: 'support@mangodude.in' } }, { upsert: true });

  if (!(await User.exists({ email: DEMO.superAdmin.email }))) {
    await User.create({ name: 'Mango Dude Owner', email: DEMO.superAdmin.email, role: ROLES.SUPER_ADMIN, passwordHash: await hashPassword(DEMO.superAdmin.password) });
  }
}

// ------------------------------------------------------------------ demo schools with activity history
const FIRST = ['Aarav', 'Diya', 'Vihaan', 'Ananya', 'Arjun', 'Isha', 'Kabir', 'Myra', 'Reyansh', 'Saanvi', 'Aditya', 'Kiara', 'Rohan', 'Meera', 'Dev', 'Tara'];
const LAST = ['Sharma', 'Reddy', 'Patel', 'Iyer', 'Khan', 'Singh', 'Nair', 'Gupta', 'Das', 'Menon'];

async function seedDemoSchools() {
  if (await School.exists({})) {
    console.log('Schools already exist — skipping demo school data.');
    return;
  }
  const superAdmin = (await User.findOne({ email: DEMO.superAdmin.email }).lean())!;
  const plans = new Map((await SubscriptionPlan.find().lean()).map((p) => [p.name, p]));
  const programmes = await Programme.find().lean();
  const subjects = await Subject.find().lean();
  const classLevels = new Map<number, Types.ObjectId>((await ClassLevel.find().lean()).map((c) => [c.levelNumber as number, c._id]));
  const learningQuizzes = await Quiz.find({ context: 'learning' }).lean();
  const games = await Game.find().lean();
  const teacherHash = await hashPassword(DEMO.teacherPassword);
  const adminHash = await hashPassword(DEMO.schoolAdminPassword);
  const pinHash = await hashPassword(DEMO.studentPin);

  const schoolsDef = [
    { code: 'GVS001', name: 'Green Valley School', city: 'Hyderabad', region: 'Telangana', plan: 'Basic', levels: [4, 5], prefix: 'gvs' },
    { code: 'SUN002', name: 'Sunrise Public School', city: 'Bengaluru', region: 'Karnataka', plan: 'Pro', levels: [6, 7], prefix: 'sun' },
    { code: 'LTS003', name: 'Lotus International School', city: 'Pune', region: 'Maharashtra', plan: 'Premium', levels: [8, 9, 10], prefix: 'lts' },
  ];
  const start = new Date(Date.now() - 120 * 86400000);
  const end = new Date(Date.now() + 245 * 86400000);
  let studentSeq = 0;

  for (const [si, d] of schoolsDef.entries()) {
    const plan = plans.get(d.plan)!;
    const school = await School.create({
      schoolCode: d.code,
      name: d.name,
      city: d.city,
      region: d.region,
      address: `${10 + si} Main Road, ${d.city}`,
      contactPerson: { name: 'Principal', email: `principal@${d.prefix}.edu.in`, phone: '+91 90000 0000' + si },
      timezone: 'Asia/Kolkata',
      currentAcademicYear: '2026-27',
      createdAt: new Date(Date.now() - (300 - si * 80) * 86400000),
    });
    await setClassAccess(school._id, CLASS_LEVELS.filter((n) => n <= plan.maxClassLevel), superAdmin._id);
    await SchoolSubscription.create({ schoolId: school._id, planId: plan._id, startDate: start, endDate: end, status: 'active', assignedBy: superAdmin._id });
    for (const p of programmes) {
      await SchoolProgrammeEntitlement.create({ schoolId: school._id, programmeId: p._id, enabled: plan.programmeCodes.includes(p.code), validFrom: start, validUntil: end, updatedBy: superAdmin._id });
    }

    const admin = await User.create({ name: `${d.name.split(' ')[0]} Admin`, email: `admin@${d.prefix}.edu.in`, role: ROLES.SCHOOL_ADMIN, passwordHash: adminHash });
    await SchoolMembership.create({ schoolId: school._id, userId: admin._id, role: ROLES.SCHOOL_ADMIN });

    const sections: Array<{ _id: Types.ObjectId; levelNumber: number }> = [];
    for (const lvl of d.levels) {
      for (const name of ['A', 'B']) {
        const s = await ClassSection.create({ schoolId: school._id, classLevelId: classLevels.get(lvl), levelNumber: lvl, sectionName: name, academicYear: '2026-27' });
        sections.push({ _id: s._id, levelNumber: lvl });
      }
    }

    const teachers = [];
    const teacherNames = ['Priya Verma', 'Rahul Mehta', 'Lakshmi Rao'];
    for (const [ti, tn] of teacherNames.entries()) {
      const t = await User.create({ name: tn, email: `${tn.split(' ')[0].toLowerCase()}@${d.prefix}.edu.in`, role: ROLES.TEACHER, passwordHash: teacherHash });
      await SchoolMembership.create({ schoolId: school._id, userId: t._id, role: ROLES.TEACHER });
      const subj = subjects.filter((_, i) => i % teacherNames.length === ti).map((s) => s._id);
      for (const s of sections) await TeacherAssignment.create({ schoolId: school._id, teacherId: t._id, classSectionId: s._id, subjectIds: subj });
      teachers.push({ user: t, subjects: subj });
    }

    // Students + history
    for (const s of sections) {
      for (let k = 0; k < 6; k++) {
        studentSeq++;
        const name = `${FIRST[(studentSeq * 7) % FIRST.length]} ${LAST[(studentSeq * 3) % LAST.length]}`;
        const user = await User.create({ name, role: ROLES.STUDENT, passwordHash: pinHash, createdAt: new Date(Date.now() - (200 - studentSeq) * 86400000) });
        await SchoolMembership.create({ schoolId: school._id, userId: user._id, role: ROLES.STUDENT });
        const code = `${d.code.slice(0, 3)}${s.levelNumber}${String(k + 1).padStart(2, '0')}${sections.indexOf(s) % 2 ? 'B' : 'A'}`;
        await StudentProfile.create({ schoolId: school._id, userId: user._id, studentCode: code, classSectionId: s._id, levelNumber: s.levelNumber, displayName: name.split(' ')[0], createdAt: user.get('createdAt') });

        const skill = 45 + ((studentSeq * 13) % 50); // 45..94
        for (let a = 0; a < 8; a++) {
          const quiz = learningQuizzes[(studentSeq + a) % learningQuizzes.length];
          const when = new Date(Date.now() - ((a * 6 + studentSeq) % 55) * 86400000 - 3600000);
          const graded = quiz.questions.map((q, qi) => {
            const correct = (skill + qi * 17 + a * 11) % 100 < skill;
            return { questionId: q._id, selectedIndex: correct ? q.correctIndex : (q.correctIndex + 1) % q.options.length, correct, marksAwarded: correct ? 1 : 0 };
          });
          const score = graded.filter((g) => g.correct).length;
          await AssessmentAttempt.create({
            schoolId: school._id,
            studentId: user._id,
            quizId: quiz._id,
            quizVersion: 1,
            context: 'learning',
            subjectId: quiz.subjectId,
            classSectionId: s._id,
            clientAttemptId: `seed-${user._id}-${a}`,
            answers: graded,
            score,
            maxScore: graded.length,
            correctCount: score,
            questionCount: graded.length,
            percent: Math.round((score / graded.length) * 1000) / 10,
            submittedAt: when,
            durationSec: 120 + a * 10,
          });
          const item = await LearningItem.findOne({ quizId: quiz._id }).lean();
          if (item) {
            await LearningProgress.updateOne(
              { studentId: user._id, learningItemId: item._id },
              { $setOnInsert: { schoolId: school._id, subjectId: item.subjectId, status: a % 3 === 0 ? 'in_progress' : 'completed', progressPct: a % 3 === 0 ? 40 : 100, lastOpenedAt: when, ...(a % 3 === 0 ? {} : { completedAt: when }) } },
              { upsert: true },
            );
          }
        }
        for (let gIdx = 0; gIdx < 3; gIdx++) {
          const g = games[(studentSeq + gIdx) % games.length];
          const when = new Date(Date.now() - (gIdx * 4 + 1) * 86400000);
          await GameAttempt.create({
            schoolId: school._id,
            studentId: user._id,
            gameId: g._id,
            classSectionId: s._id,
            localDateKey: localDateKey(when, 'Asia/Kolkata'),
            seq: 1,
            score: 50 + ((studentSeq * 37 + gIdx * 13) % 400),
            level: 1 + (gIdx % 3),
            durationSec: 90,
            outcome: 'completed',
            startedAt: when,
            finishedAt: new Date(when.getTime() + 90000),
          });
        }
        const entitled = programmes.filter((p) => plan.programmeCodes.includes(p.code));
        if (entitled.length && studentSeq % 2 === 0) {
          const p = entitled[studentSeq % entitled.length];
          const items = p.modules.flatMap((m) => m.items).filter((i) => i.type !== 'quiz');
          const doneItems = items.slice(0, 1 + (studentSeq % items.length));
          const required = p.modules.flatMap((m) => m.items).length;
          await ProgrammeEnrolment.create({ schoolId: school._id, studentId: user._id, programmeId: p._id, completedItemIds: doneItems.map((i) => i._id), progressPct: Math.round((doneItems.length / required) * 100), lastActivityAt: new Date() });
        }
        if (skill >= 70) {
          const lvl1 = await CertificationLevel.findOne({ level: 1 }).lean();
          await Certificate.create({
            certificateNumber: `MD-2026-${String(studentSeq).padStart(6, '0')}`,
            verificationCode: new Types.ObjectId().toHexString().slice(-12).toUpperCase(),
            schoolId: school._id,
            studentId: user._id,
            certificationLevelId: lvl1!._id,
            level: 1,
            levelTitle: lvl1!.title,
            percent: skill,
            studentDisplayName: name,
            schoolName: d.name,
            issuedAt: new Date(Date.now() - (studentSeq % 30) * 86400000),
          });
        }
      }
    }
    await mongoose.connection.collection('counters').updateOne({ _id: 'certificate-2026' as never }, { $max: { seq: studentSeq } }, { upsert: true });

    // A published practice activity per teacher on their first section
    const practice = await Quiz.findOne({ context: 'activity', subjectId: teachers[0].subjects[0] }).lean();
    const sec = sections[0];
    const act = await Activity.create({
      schoolId: school._id,
      teacherId: teachers[0].user._id,
      classSectionId: sec._id,
      subjectId: teachers[0].subjects[0],
      type: 'quiz',
      title: 'Weekly practice quiz',
      instructions: 'Answer all questions. You can take it once.',
      quizId: practice?._id,
      startAt: new Date(Date.now() - 2 * 86400000),
      dueAt: new Date(Date.now() + 5 * 86400000),
      status: 'published',
      publishedAt: new Date(Date.now() - 2 * 86400000),
    });
    await Activity.create({
      schoolId: school._id,
      teacherId: teachers[0].user._id,
      classSectionId: sec._id,
      subjectId: teachers[0].subjects[0],
      type: 'worksheet',
      title: 'Observation worksheet',
      instructions: 'Observe the sky for 3 evenings and note what you see.',
      worksheetRef: 'Worksheet W-12 (printed handout)',
      startAt: new Date(Date.now() - 86400000),
      dueAt: new Date(Date.now() + 6 * 86400000),
      status: 'published',
      publishedAt: new Date(),
    });
    const firstStudents = await StudentProfile.find({ classSectionId: sec._id }).limit(2).lean();
    for (const fs of firstStudents) {
      await ActivityCompletion.create({ schoolId: school._id, activityId: act._id, studentId: fs.userId, completedAt: new Date() });
    }
    console.log(`  ✓ ${d.name} (${d.code}) — plan ${d.plan}, classes 1–${plan.maxClassLevel}`);
  }
}

/** Seed reference + demo data into the currently connected database. */
export async function seedAll(opts: { reset?: boolean } = {}) {
  const dbName = mongoose.connection.name;
  if (opts.reset) {
    if (env().NODE_ENV === 'production') throw new Error('Refusing to --reset in production');
    console.log(`Dropping all collections in database "${dbName}"…`);
    for (const c of await mongoose.connection.db!.listCollections().toArray()) await mongoose.connection.db!.dropCollection(c.name);
  }
  console.log('Creating indexes…');
  await syncIndexes();
  console.log('Seeding reference data…');
  await seedReference();
  console.log('Seeding demo schools…');
  await seedDemoSchools();
  console.log(`Seed complete. Database: ${dbName}. Demo accounts: see docs/DEMO_ACCOUNTS.md`);
}

if (require.main === module) {
  (async () => {
    await connectDb(env().MONGO_URI);
    await seedAll({ reset: process.argv.includes('--reset') });
    await mongoose.disconnect();
  })().catch(async (e) => {
    console.error(e);
    await mongoose.disconnect();
    process.exit(1);
  });
}
