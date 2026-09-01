import { createRouter, createWebHistory } from 'vue-router'
import HomePage from '../views/HomePage.vue'
import ReportsPage from '../views/ReportsPage.vue'
import BackupPage from '../views/BackupPage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomePage },
    { path: '/dashboard', redirect: '/' },
    { path: '/reports', name: 'reports', component: ReportsPage },
    { path: '/backup', name: 'backup', component: BackupPage },
  ],
})

export default router
