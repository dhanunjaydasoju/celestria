// Home (/) — owner: UI. Placeholder hero until the full landing page is
// designed; sections are separate components so they can be replaced.

import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import HeroScene from '../../three/viewports/HeroScene.jsx'
import './HomePage.css'

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
  return (
    <section className="home">
      <HeroScene />
      <HomeHero />
      <p className="home-credit">Planet shown is an artistic impression.</p>
    </section>
  )
}
