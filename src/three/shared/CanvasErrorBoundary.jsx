// Catches WebGL/scene errors so a failed 3D view never takes the page down —
// owner: LEAD. Viewports pass a 2D fallback describing what would be shown.

import { Component } from 'react'

export default class CanvasErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('[CELESTRIA 3D]', error)
  }

  render() {
    return this.state.error ? this.props.fallback : this.props.children
  }
}
