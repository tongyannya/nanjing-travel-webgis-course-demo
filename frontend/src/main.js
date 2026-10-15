import { createApp } from 'vue'
import './styles/tokens.css'
import './styles/base.css'
import './styles/shell.css'
import './styles/workflow.css'
import './styles/map-workspace.css'
import './styles/dialogs.css'
import './styles/splash.css'
import './styles/dining-map.css'
import './styles/map-markers.css'
import './styles/accommodation-map.css'
import CourseDemoEntry from './components/CourseDemoEntry.vue'
import { installTutorialDemoStorage } from './tutorial/demoContext'

installTutorialDemoStorage()
createApp(CourseDemoEntry).mount('#app')
