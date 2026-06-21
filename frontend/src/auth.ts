// Token storage + login state. Single-admin panel: one HMAC token in localStorage.

const KEY = 'wo_token'
const EXP = 'wo_token_exp'

export const auth = {
  get: () => localStorage.getItem(KEY) ?? '',
  set: (t: string, expiresIn?: number) => {
    localStorage.setItem(KEY, t)
    if (expiresIn) localStorage.setItem(EXP, String(Date.now() + expiresIn * 1000))
  },
  clear: () => {
    localStorage.removeItem(KEY)
    localStorage.removeItem(EXP)
  },
  isAuthed: () => {
    if (!localStorage.getItem(KEY)) return false
    const exp = Number(localStorage.getItem(EXP) ?? 0)
    if (exp && Date.now() >= exp) {
      auth.clear()
      return false
    }
    return true
  },
}
