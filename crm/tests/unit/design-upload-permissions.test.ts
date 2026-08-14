import { describe, expect, it } from 'vitest';
import { canUploadCategory, canUploadDesignVersion } from '@/lib/permissions';

const project = {
  assigned_designer_id: 'designer-1',
  status: 'IN_PROGRESS' as const,
};

describe('design upload permissions', () => {
  it('allows only the assigned Landscape Designer to upload a design version', () => {
    expect(canUploadDesignVersion({ id: 'designer-1', role: 'DESIGNER' }, project)).toBe(true);
    expect(canUploadDesignVersion({ id: 'designer-2', role: 'DESIGNER' }, project)).toBe(false);
    expect(canUploadDesignVersion({ id: 'admin-1', role: 'ADMIN' }, project)).toBe(false);
    expect(canUploadDesignVersion({ id: 'bdm-1', role: 'BDM' }, project)).toBe(false);
  });

  it('does not grant the design-version upload category to Admin', () => {
    expect(canUploadCategory({ id: 'admin-1', role: 'ADMIN' }, 'DESIGN_VERSION')).toBe(false);
    expect(canUploadCategory({ id: 'designer-1', role: 'DESIGNER' }, 'DESIGN_VERSION')).toBe(true);
  });

  it('blocks uploads after approval or cancellation', () => {
    const designer = { id: 'designer-1', role: 'DESIGNER' as const };
    expect(canUploadDesignVersion(designer, { ...project, status: 'APPROVED' })).toBe(false);
    expect(canUploadDesignVersion(designer, { ...project, status: 'CANCELLED' })).toBe(false);
  });
});
