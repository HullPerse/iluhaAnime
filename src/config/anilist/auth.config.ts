export const ANILIST_CLIENT_ID = "44319";

// Registered redirect in the AniList app settings: iluhaanime://auth/anilist
export const ANILIST_REDIRECT_URI = "iluhaanime://auth/anilist";

export function buildAnilistAuthorizeUrl(clientId: string): string {
  const params = new URLSearchParams({ client_id: clientId, response_type: "token" });
  return `https://anilist.co/api/v2/oauth/authorize?${params.toString()}`;
}
