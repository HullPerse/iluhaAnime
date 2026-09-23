import { describe, expect, it } from "vitest";

import {
  ANILIST_CLIENT_ID,
  ANILIST_REDIRECT_URI,
  buildAnilistAuthorizeUrl,
} from "@/config/anilist/auth.config";

describe("anilist auth config", () => {
  it("points the callback at the app scheme", () => {
    expect(ANILIST_REDIRECT_URI).toBe("iluhaanime://auth/anilist");
  });

  it("builds the implicit authorize url", () => {
    expect(buildAnilistAuthorizeUrl("12345")).toBe(
      "https://anilist.co/api/v2/oauth/authorize?client_id=12345&response_type=token"
    );
  });

  it("carries the shared registered client id", () => {
    expect(ANILIST_CLIENT_ID).toBe("44319");
  });
});
