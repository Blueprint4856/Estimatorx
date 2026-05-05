import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import Estimator from "@/pages/Estimator";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#E85D26",
    colorForeground: "#F7F4F0",
    colorMutedForeground: "#A8A09A",
    colorDanger: "#EF4444",
    colorBackground: "#1A1A1A",
    colorInput: "#2C2825",
    colorInputForeground: "#F7F4F0",
    colorNeutral: "#3A3530",
    fontFamily: "'DM Sans', sans-serif",
    borderRadius: "0px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#1A1A1A] rounded-none w-[440px] max-w-full overflow-hidden border border-[#3A3530]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#F7F4F0]",
    headerSubtitle: "text-[#A8A09A]",
    socialButtonsBlockButtonText: "text-[#F7F4F0]",
    formFieldLabel: "text-[#A8A09A]",
    footerActionLink: "text-[#E85D26]",
    footerActionText: "text-[#A8A09A]",
    dividerText: "text-[#A8A09A]",
    identityPreviewEditButton: "text-[#E85D26]",
    formFieldSuccessText: "text-green-400",
    alertText: "text-[#F7F4F0]",
    logoBox: "mb-2",
    logoImage: "h-14",
    socialButtonsBlockButton: "!border-[#3A3530] !bg-[#2C2825]",
    formButtonPrimary: "!bg-[#E85D26] hover:!bg-[#D44A15] !rounded-none !font-bold !uppercase !tracking-widest",
    formFieldInput: "!bg-[#2C2825] !border-[#3A3530] !text-[#F7F4F0] !rounded-none",
    footerAction: "!bg-transparent",
    dividerLine: "!bg-[#3A3530]",
    alert: "!bg-[#2C2825] !border-[#3A3530]",
    otpCodeFieldInput: "!bg-[#2C2825] !border-[#3A3530] !text-[#F7F4F0]",
    formFieldRow: "",
    main: "",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#1A1A1A] px-4 py-12">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        forceRedirectUrl={`${basePath}/estimator`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#1A1A1A] px-4 py-12">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        forceRedirectUrl={`${basePath}/estimator`}
      />
    </div>
  );
}

function ProtectedEstimator() {
  return (
    <>
      <Show when="signed-in">
        <Estimator />
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/estimator" component={ProtectedEstimator} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to access your estimates",
          },
        },
        signUp: {
          start: {
            title: "Create your account",
            subtitle: "Free access to the full estimating tool",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
