// The app's route table. Kept separate from main.js so tests can inspect it.
import { homePage } from './pages/home.js';
import { emergencyPage, emergencyCardPage } from './pages/emergency.js';
import { searchPage } from './pages/search.js';
import { askPage } from './pages/ask.js';
import { storagePage } from './pages/storage.js';
import { guidesHome, guidesCategory, guidePage } from './pages/guides.js';
import { checklistsHome, checklistPage } from './pages/checklists.js';
import { calculatorsHome, calculatorPage } from './pages/calculators.js';
import { planHome, planSection } from './pages/plan.js';
import { backupPage } from './pages/backup.js';
import { aboutPage } from './pages/about.js';
import { handbookPage } from './pages/handbook.js';

export const routes = [
  { pattern: '', title: 'Home', page: () => homePage() },
  { pattern: 'emergency', title: 'Emergency Now', page: () => emergencyPage() },
  { pattern: 'emergency/:id', title: 'Emergency card', page: (p) => emergencyCardPage(p) },
  { pattern: 'search', title: 'Search', page: (p, ctx) => searchPage(p, ctx) },
  { pattern: 'ask', title: 'Ask Cairn', page: (p, ctx) => askPage(p, ctx) },
  { pattern: 'storage', title: 'Offline & storage status', page: () => storagePage() },
  { pattern: 'guides', title: 'Guides', page: () => guidesHome() },
  { pattern: 'guides/:cat', title: 'Guides', page: (p) => guidesCategory(p) },
  { pattern: 'guide/:id', title: 'Guide', page: (p) => guidePage(p) },
  { pattern: 'checklists', title: 'Checklists', page: () => checklistsHome() },
  { pattern: 'checklist/:id', title: 'Checklist', page: (p) => checklistPage(p) },
  { pattern: 'calculators', title: 'Calculators', page: () => calculatorsHome() },
  { pattern: 'calc/:id', title: 'Calculator', page: (p) => calculatorPage(p) },
  { pattern: 'plan', title: 'My Plan', page: () => planHome() },
  { pattern: 'plan/:section', title: 'My Plan', page: (p) => planSection(p) },
  { pattern: 'handbook', title: 'Printable handbook', page: () => handbookPage() },
  { pattern: 'about', title: 'About and disclaimer', page: () => aboutPage() },
  { pattern: 'backup', title: 'Backup and restore', page: () => backupPage() },
];
