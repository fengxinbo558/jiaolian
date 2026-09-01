import { describe, expect, it } from "vitest";
import { handleFormApi } from "./form-api.mjs";

function body(result) {
  return JSON.parse(result.body);
}

describe("stateless invitation authentication", () => {
  it("activates with the local invite and restores the same identity", async () => {
    const activation = await handleFormApi({
      method: "POST",
      pathname: "/api/auth/activate",
      rawBody: JSON.stringify({ code: "FORM-DEMO-2026" }),
    });
    expect(activation.status).toBe(200);
    expect(body(activation).accountId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body(activation).recoveryCode).toMatch(/^FORMR-/);
    expect(activation.headers["Set-Cookie"]).toContain("HttpOnly");

    const cookie = activation.headers["Set-Cookie"].split(";")[0];
    const session = await handleFormApi({
      method: "GET",
      pathname: "/api/auth/session",
      headers: { cookie },
    });
    expect(body(session)).toMatchObject({ authenticated: true, accountId: body(activation).accountId });

    const recovery = await handleFormApi({
      method: "POST",
      pathname: "/api/auth/recover",
      rawBody: JSON.stringify({ code: body(activation).recoveryCode }),
    });
    expect(recovery.status).toBe(200);
    expect(body(recovery).accountId).toBe(body(activation).accountId);
  });

  it("rejects invalid invites and tampered recovery codes", async () => {
    const invalidInvite = await handleFormApi({
      method: "POST",
      pathname: "/api/auth/activate",
      rawBody: JSON.stringify({ code: "not-an-invite" }),
    });
    expect(invalidInvite.status).toBe(403);

    const invalidRecovery = await handleFormApi({
      method: "POST",
      pathname: "/api/auth/recover",
      rawBody: JSON.stringify({ code: "FORMR-tampered.value" }),
    });
    expect(invalidRecovery.status).toBe(403);
  });

  it("does not expose the deprecated stateful invite administration route", async () => {
    const result = await handleFormApi({ method: "POST", pathname: "/api/admin/invites" });
    expect(result.status).toBe(410);
  });
});
