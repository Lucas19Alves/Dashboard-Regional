import { settings } from './settings'

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

export function getDefaultStoreCodes(regionId) {
  return [...(REGIONS[regionId]?.storeCodes || [])]
}

// Lojas efetivas da regional: a lista das configurações, quando o usuário alterou a padrão.
export function getStoreCodes(regionId) {
  const override = settings.storeOverrides[regionId]
  return Array.isArray(override) ? [...override] : getDefaultStoreCodes(regionId)
}

function withStores(region) {
  return { ...region, storeCodes: getStoreCodes(region.id) }
}

export function getRegionList() {
  return Object.values(REGIONS).map(withStores)
}

export const REGION_LIST = Object.values(REGIONS)

export function getRegion(regionId) {
  const region = REGIONS[String(regionId || '').toLowerCase()] || REGIONS.sp6
  return withStores(region)
}

export function sessionBelongsToRegion(session, regionId) {
  const target = getRegion(regionId)
  if (session?.regionId) return session.regionId === target.id
  return target.id === 'sp6' && (!session?.region || session.region === 'Regional SP6')
}
