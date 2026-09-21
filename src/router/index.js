import { createRouter, createWebHistory } from 'vue-router'
import HomePage from '../views/HomePage.vue'
import ReportsPage from '../views/ReportsPage.vue'
import BackupPage from '../views/BackupPage.vue'
import RegionSelectPage from '../views/RegionSelectPage.vue'
import { REGIONS } from '../lib/regions'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'regions', component: RegionSelectPage },
    { path: '/regional/:region/auditorias', name: 'audits', component: HomePage },
    { path: '/regional/:region/relatorios', name: 'reports', component: ReportsPage },
    { path: '/regional/:region/backup', name: 'backup', component: BackupPage },
    { path: '/dashboard', redirect: '/regional/sp6/auditorias' },
    { path: '/reports', redirect: '/regional/sp6/relatorios' },
    { path: '/backup', redirect: '/regional/sp6/backup' },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  if (to.params.region && !REGIONS[String(to.params.region).toLowerCase()]) return '/'
})

export default router
