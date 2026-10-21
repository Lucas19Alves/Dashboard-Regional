import { createRouter, createWebHistory } from 'vue-router'
import RegionSelectPage from '../views/RegionSelectPage.vue'
import { REGIONS, getRegion } from '../lib/regions'

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: (to, from, saved) => saved || { top: 0 },
  routes: [
    { path: '/', name: 'regions', component: RegionSelectPage, meta: { title: 'Regionais' } },
    { path: '/configuracoes', name: 'settings', component: () => import('../views/SettingsPage.vue'), meta: { title: 'Configurações' } },
    { path: '/regional/:region/auditorias', name: 'audits', component: () => import('../views/HomePage.vue'), meta: { title: 'Auditorias' } },
    { path: '/regional/:region/relatorios', name: 'reports', component: () => import('../views/ReportsPage.vue'), meta: { title: 'Relatórios' } },
    { path: '/regional/:region/backup', name: 'backup', component: () => import('../views/BackupPage.vue'), meta: { title: 'Backup' } },
    { path: '/dashboard', redirect: '/regional/sp6/auditorias' },
    { path: '/reports', redirect: '/regional/sp6/relatorios' },
    { path: '/backup', redirect: '/regional/sp6/backup' },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  if (to.params.region && !REGIONS[String(to.params.region).toLowerCase()]) return '/'
})

router.afterEach((to) => {
  const parts = [to.meta.title]
  if (to.params.region) parts.push(getRegion(to.params.region).code)
  parts.push('Dashboard de Regionais')
  document.title = parts.filter(Boolean).join(' - ')
})

export default router
