/* X-User-Id helper — Sprint 1 stub.
   Replaced by JWT/session in Sprint 2. */

const KEY = 'marathon.user.id.v1';

export function getUserId() {
  return localStorage.getItem(KEY);
}

export function setUserId(id) {
  if (id) localStorage.setItem(KEY, id);
  else    localStorage.removeItem(KEY);
}
