const ROLE_PERMISSIONS = {
  admin: {
    can: () => true,
  },
  ontology_editor: {
    can: ({ resource, action }) => {
      const allowed = ['objects', 'schema', 'graph', 'agent'];
      if (action === 'list' || action === 'show') return allowed.includes(resource);
      if (action === 'create' || action === 'update') return ['objects', 'schema'].includes(resource);
      return false;
    },
  },
  reviewer: {
    can: ({ resource, action }) => {
      if (action === 'list' || action === 'show') return true;
      if (action === 'update') return resource === 'review';
      return false;
    },
  },
  viewer: {
    can: ({ action }) => action === 'list' || action === 'show',
  },
};

const accessControlProvider = {
  can: async ({ resource, action }) => {
    const raw = localStorage.getItem('pto-auth');
    const user = raw ? JSON.parse(raw) : null;
    const role = user?.role || 'viewer';
    const checker = ROLE_PERMISSIONS[role];
    if (!checker) return { can: false };
    return { can: checker.can({ resource, action }) };
  },
};

export default accessControlProvider;
