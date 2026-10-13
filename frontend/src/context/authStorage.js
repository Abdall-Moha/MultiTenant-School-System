export const TOKEN_KEY = "schoolms_token";
export const USER_KEY = "schoolms_user";

export function clearSavedSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
