export const REGIONS = {
  sp6: {
    id: 'sp6',
    code: 'SP6',
    name: 'Regional SP6',
    description: 'Regional configurada e pronta para receber auditorias.',
    storeCodes: ['008', '015', '093', '096', '112', '127', '149', '151', '233', '270', '280', '282', '337'],
    status: 'active',
    accent: 'blue',
  },
  sp4: {
    id: 'sp4',
    code: 'SP4',
    name: 'Regional SP4',
    description: 'Regional configurada com 11 lojas.',
    storeCodes: ['018', '085', '086', '155', '199', '209', '258', '269', '271', '272', '279'],
    status: 'active',
    accent: 'violet',
  },
}

export const REGION_LIST = Object.values(REGIONS)

export function getRegion(regionId) {
  return REGIONS[String(regionId || '').toLowerCase()] || REGIONS.sp6
}

export function sessionBelongsToRegion(session, regionId) {
  const target = getRegion(regionId)
  if (session?.regionId) return session.regionId === target.id
  return target.id === 'sp6' && (!session?.region || session.region === 'Regional SP6')
}
