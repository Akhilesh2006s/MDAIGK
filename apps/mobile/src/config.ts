import { Platform } from 'react-native';

/**
 * API base URL. Override with EXPO_PUBLIC_API_URL (e.g. http://192.168.1.20:4000 for a
 * physical device). Defaults: Android emulator reaches the host via 10.0.2.2.
 */
const fallback = Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || fallback).replace(/\/+$/, '');
export const API_PREFIX = '/api/v1';
