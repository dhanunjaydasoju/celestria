import { describe, expect, it } from 'vitest'
import { formatMeasurement } from './formatMeasurement.js'

describe('formatMeasurement', () => {
  it('rounds to the precision of the uncertainty', () => {
    expect(formatMeasurement(15.58051, [0.33, -0.33])).toEqual({ value: '15.58', plus: '0.33', minus: '0.33', symmetric: true })
    expect(formatMeasurement(1.63, [0.23, -0.2])).toMatchObject({ value: '1.63', plus: '0.23', minus: '0.20', symmetric: false })
  })

  it('keeps large values readable', () => {
    expect(formatMeasurement(2601, [55, -55]).value).toBe('2,601')
  })

  it('falls back to significant figures without uncertainty', () => {
    expect(formatMeasurement(1323.46926959).value).toBe('1,323')
    expect(formatMeasurement(0.0051).value).toBe('0.0051')
  })

  it('handles missing values', () => {
    expect(formatMeasurement(null).value).toBe('—')
  })
})
