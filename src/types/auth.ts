export type UserStatus = "PENDING" | "ACTIVE" | "DISABLED";
export type VisibleArticleType = "RAW_MATERIAL" | "RESALE";

export interface User {
  id: string;
  code?: string;
  businessName?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  passwordHash?: string; // Kept strictly on the backend, omitted from client responses
  status: UserStatus;
  role: string | null;
  permissions: string[];
  visibleArticleTypes?: VisibleArticleType[];
  assignedStores: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  token: string | null;
}

export interface SignUpPayload {
  firstName: string;
  lastName: string;
  position: string;
  email: string;
  phone?: string;
  password: string;
  signupCode: string;
}

export interface ResellerSignUpPayload {
  businessName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  signupCode: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  code: string;
  message: string;
  data?: T;
}
