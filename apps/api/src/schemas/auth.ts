import { Type, type Static } from "@sinclair/typebox";

export const UserResponse = Type.Object({
  id: Type.String({ format: "uuid" }),
  name: Type.Union([Type.String(), Type.Null()]),
  email: Type.String({ format: "email" }),
  createdAt: Type.String({ format: "date-time" }),
});
export type UserResponseType = Static<typeof UserResponse>;

const TokenPair = Type.Object({
  accessToken: Type.String(),
  refreshToken: Type.String(),
});

export const AuthSuccessResponse = Type.Object({
  user: UserResponse,
  accessToken: Type.String(),
  refreshToken: Type.String(),
});
export type AuthSuccessResponseType = Static<typeof AuthSuccessResponse>;

export const MessageResponse = Type.Object({
  message: Type.String(),
});

export const SignupBody = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 255 }),
    email: Type.String({ format: "email", maxLength: 254 }),
    password: Type.String({ minLength: 8, maxLength: 128 }),
  },
  { additionalProperties: false },
);
export type SignupBodyType = Static<typeof SignupBody>;

export const signupSchema = {
  description: "Register a new user account",
  tags: ["auth"],
  body: SignupBody,
  response: {
    201: AuthSuccessResponse,
  },
};

export const SigninBody = Type.Object(
  {
    email: Type.String({ format: "email", maxLength: 254 }),
    password: Type.String({ minLength: 1, maxLength: 128 }),
  },
  { additionalProperties: false },
);
export type SigninBodyType = Static<typeof SigninBody>;

export const signinSchema = {
  description: "Authenticate with email and password",
  tags: ["auth"],
  body: SigninBody,
  response: {
    200: AuthSuccessResponse,
  },
};

export const RefreshBody = Type.Object(
  {
    refreshToken: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type RefreshBodyType = Static<typeof RefreshBody>;

export const refreshSchema = {
  description: "Exchange a valid refresh token for a new token pair",
  tags: ["auth"],
  body: RefreshBody,
  response: {
    200: TokenPair,
  },
};

export const LogoutBody = Type.Object(
  {
    refreshToken: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type LogoutBodyType = Static<typeof LogoutBody>;

export const logoutSchema = {
  description: "Invalidate a refresh token (logout)",
  tags: ["auth"],
  body: LogoutBody,
  response: {
    200: MessageResponse,
  },
};
