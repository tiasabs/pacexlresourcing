import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getDemoAccount } from "@/lib/airtable/app-accounts";

const cookieName = "resourcing_demo_persona";
const maxAgeSeconds = 60 * 60 * 12;

function getSecret() {
  const configuredSecret = process.env.DEMO_SESSION_SECRET;
  if (configuredSecret) return configuredSecret;
  if (process.env.NODE_ENV === "development") {
    return "local-demo-only-change-before-deployment";
  }
  throw new Error("DEMO_SESSION_SECRET must be set outside local development.");
}

function sign(accountId: string, issuedAt: number) {
  return createHmac("sha256", getSecret())
    .update(`${accountId}.${issuedAt}`)
    .digest("hex");
}

export function createDemoSessionToken(accountId: string) {
  const issuedAt = Math.floor(Date.now() / 1000);
  return `${accountId}.${issuedAt}.${sign(accountId, issuedAt)}`;
}

export function verifyDemoSessionToken(token: string) {
  const [accountId, issuedAtRaw, providedSignature] = token.split(".");
  const issuedAt = Number(issuedAtRaw);

  if (!accountId || !Number.isFinite(issuedAt) || !providedSignature) return null;
  const now = Math.floor(Date.now() / 1000);
  if (issuedAt > now + 60 || now - issuedAt > maxAgeSeconds) return null;

  const expected = Buffer.from(sign(accountId, issuedAt));
  const provided = Buffer.from(providedSignature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return null;
  }

  return accountId;
}

export async function getDemoSession() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const accountId = verifyDemoSessionToken(token);
  return accountId ? getDemoAccount(accountId) : null;
}

export async function setDemoSession(accountId: string) {
  const account = await getDemoAccount(accountId);
  if (!account) throw new Error("Unknown demo account.");

  (await cookies()).set(cookieName, createDemoSessionToken(accountId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export async function clearDemoSession() {
  (await cookies()).set(cookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
}
