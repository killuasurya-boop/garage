"use client";

import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

export const authClient = createAuthClient({
  // oauthProviderClient: meneruskan query OAuth bertanda tangan (MCP ChatGPT)
  // ke POST auth; tanpa `sig` di URL tidak melakukan apa pun.
  plugins: [twoFactorClient(), oauthProviderClient()],
});
