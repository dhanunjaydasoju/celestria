// Router + app root — owner: LEAD (integration point).
// Need a route? Ask the lead; don't edit this file directly.

import { useEffect } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import AppShell from './layout/AppShell.jsx'
import RouteError from './layout/RouteError.jsx'
import { useCelestria } from './store/useCelestria.js'

// Each page is its own chunk, so three.js only loads on pages that use it.
const page = (load) => () => load().then((m) => ({ Component: m.default }))

const routes = [
  {
    path: '/',
    Component: Root,
    ErrorBoundary: RouteError,
    HydrateFallback: AppLoading,
    children: [
      { index: true, lazy: page(() => import('./pages/home/HomePage.jsx')) },
      { path: 'explore/:host?', lazy: page(() => import('./pages/ExplorePage.jsx')) },
      { path: 'planet/:id', lazy: page(() => import('./pages/PlanetPage.jsx')) },
      { path: 'planet/:id/orbit', lazy: page(() => import('./pages/OrbitPage.jsx')) },
      { path: 'viewport/:id?', lazy: page(() => import('./pages/viewport/PlanetViewportPage.jsx')) },
      { path: 'orbit', lazy: page(() => import('./pages/OrbitIndexPage.jsx')) },
      { path: 'about', lazy: page(() => import('./pages/AboutPage.jsx')) },
      // Catalog (CatalogPage.jsx) and Compare are kept in the codebase but not
      // routed or linked until they are designed.
      { path: 'compare', lazy: page(() => import('./pages/ComparePage.jsx')) },
      // Dev-only 3D sandbox; excluded from production builds.
      ...(import.meta.env.DEV ? [{ path: 'lab/:viewport?', lazy: page(() => import('./three/lab/LabPage.jsx')) }] : []),
      { path: '*', lazy: page(() => import('./pages/NotFoundPage.jsx')) },
    ],
  },
]

const router = createBrowserRouter(routes)

function Root() {
  const loadCatalog = useCelestria((s) => s.loadCatalog)
  useEffect(() => {
    loadCatalog()
  }, [loadCatalog])
  return <AppShell />
}

// Shown while the first page chunk loads.
function AppLoading() {
  return null
}

export default function App() {
  return <RouterProvider router={router} />
}
