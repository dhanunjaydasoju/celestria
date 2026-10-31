// Home (/) — owner: UI (Earth hero integrated by LEAD). Sections are separate
// components so they can be replaced.
//
// Hero scene: the Earth + Soyuz-inspired scene by default. The previous
// procedural-planet hero is kept as a fallback: set HOME_SCENE to 'classic',
// or open /?scene=classic.

import { ArrowRight } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { useCelestria } from '../../store/useCelestria.js'
import EarthHeroScene from '../../three/viewports/EarthHeroScene.jsx'
import HeroScene from '../../three/viewports/HeroScene.jsx'
import './HomePage.css'

/** 'earth' (default) | 'classic' (previous homepage). */
export const HOME_SCENE = 'earth'

function HomeHero() {
  return (
    <div className="home-hero">
      <p className="home-kicker">Confirmed exoplanets · NASA Exoplanet Archive</p>
      <h1 className="home-title">CELESTRIA</h1>
      <p className="home-tagline">Explore Worlds Beyond Our Solar System.</p>
      <Link to="/explore" className="home-cta">
        Enter the observatory <ArrowRight size={16} />
      </Link>
    </div>
  )
}

export default function HomePage() {
  const [params] = useSearchParams()
  const reducedMotion = useCelestria((s) => s.reducedMotion)
  const scene = params.get('scene') === 'classic' ? 'classic' : params.get('scene') === 'earth' ? 'earth' : HOME_SCENE
  return (
    <section className={`home home--${scene}`}>
      {scene === 'earth' ? <EarthHeroScene reducedMotion={reducedMotion} /> : <HeroScene />}
      <HomeHero />
      {scene === 'classic' && <p className="home-credit">Planet shown is an artistic impression.</p>}
    </section>
  )
}
