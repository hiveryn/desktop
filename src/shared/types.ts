export type Theme = 'dark' | 'light' | 'system';

export interface UserProfile {
  name: string;
}

export interface ApiResponse<T> {
  data: T;
}
