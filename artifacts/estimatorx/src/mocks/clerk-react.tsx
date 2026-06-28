import React from "react";

export const useUser = () => ({ user: null, isLoaded: true, isSignedIn: false });
export const useClerk = () => ({ signOut: async () => {} });
export const useAuth = () => ({ isSignedIn: false, userId: null });
export const ClerkProvider = ({ children }: { children: React.ReactNode }) =>
  React.createElement(React.Fragment, null, children);
export const Show = () => null;
export const useSignIn = () => ({ signIn: {}, fetchStatus: "idle" as const });
export const useSignUp = () => ({ signUp: {}, fetchStatus: "idle" as const });
