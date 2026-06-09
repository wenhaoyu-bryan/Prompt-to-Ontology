const DEMO_USER = { username: 'demo', password: 'demo' };

const STORAGE_KEY = 'pto-auth';

function getStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const authProvider = {
  login: async ({ username, password }) => {
    if (username === DEMO_USER.username && password === DEMO_USER.password) {
      const user = { username, role: 'admin', name: 'Demo User' };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      return { success: true, redirectTo: '/' };
    }
    return { success: false, error: { name: 'LoginError', message: 'Invalid credentials' } };
  },

  logout: async () => {
    localStorage.removeItem(STORAGE_KEY);
    return { success: true, redirectTo: '/login' };
  },

  check: async () => {
    const user = getStoredUser();
    if (user) return { authenticated: true };
    return { authenticated: false, redirectTo: '/login' };
  },

  getIdentity: async () => {
    const user = getStoredUser();
    if (!user) return null;
    return {
      id: user.username,
      name: user.name || user.username,
      avatar: null,
    };
  },

  getPermissions: async () => {
    const user = getStoredUser();
    return user?.role || 'viewer';
  },
};

export default authProvider;
