// Client for the CELESTRIA API — owner: DATA (D3.5).
//
// M0 stub: getCatalog/getPlanet serve local fixtures until the live API
// (D3.4) is merged. Switching to live data is this one flag; no page changes.
// Signatures follow src/contracts/api.js. Every failure throws ApiError.

import { API_ERROR, ApiError } from '../contracts/api.js'
import { fixturePlanets } from '../data/fixtures/index.js'

const USE_FIXTURES = true

/** @returns {Promise<import('../contracts/api.js').CatalogResponse>} */
export async function getCatalog() {
  if (USE_FIXTURES) {
    return { generatedAt: new Date(0).toISOString(), source: 'fixtures', count: fixturePlanets.length, planets: fixturePlanets }
  }
  throw new ApiError(API_ERROR.NOT_IMPLEMENTED, 'Live catalog not wired yet (D3.4/D3.5).')
}

/**
 * @param {string} id
 * @returns {Promise<import('../contracts/api.js').PlanetResponse>}
 */
export async function getPlanet(id) {
  if (USE_FIXTURES) {
    const planet = fixturePlanets.find((p) => p.id === id)
    if (!planet) throw new ApiError(API_ERROR.NOT_FOUND, `No planet with id "${id}".`, 404)
    return { planet, system: fixturePlanets.filter((p) => p.host === planet.host) }
  }
  throw new ApiError(API_ERROR.NOT_IMPLEMENTED, 'Live planet lookup not wired yet (D3.4/D3.5).')
}

/**
 * Owner of the endpoint: AI (D4.3). Implemented here by DATA once it exists.
 * @param {import('../contracts/api.js').AstronomerRequest} _req
 * @returns {Promise<import('../contracts/api.js').AstronomerResponse>}
 */
export async function askAstronomer(_req) {
  throw new ApiError(API_ERROR.NOT_IMPLEMENTED, 'AI astronomer not available yet (D4.3).')
}
