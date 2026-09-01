import { createApp } from 'vue'
import { inject } from '@vercel/analytics'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './style.css'
import App from './App.vue'
import router from './router'

inject()

const app = createApp(App)
app.use(router)
app.mount('#app')
