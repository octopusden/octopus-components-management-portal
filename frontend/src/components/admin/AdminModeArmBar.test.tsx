import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminModeArmBar } from './AdminModeArmBar'
import { useAdminMode } from '@/lib/adminModeStore'

beforeEach(() => useAdminMode.setState({ enabled: false }))
afterEach(() => {
  cleanup()
  useAdminMode.setState({ enabled: false })
})

describe('AdminModeArmBar', () => {
  it('reflects the disarmed state by default', () => {
    render(<AdminModeArmBar />)
    expect(screen.getByText(/Admin mode disarmed/i)).toBeDefined()
    expect(screen.getByRole('switch')).not.toBeChecked()
  })

  it('reflects the armed state from the shared store', () => {
    useAdminMode.setState({ enabled: true })
    render(<AdminModeArmBar />)
    expect(screen.getByText(/Admin mode armed/i)).toBeDefined()
    expect(screen.getByRole('switch')).toBeChecked()
  })

  it('toggling the switch flips the shared useAdminMode store', async () => {
    render(<AdminModeArmBar />)
    expect(useAdminMode.getState().enabled).toBe(false)
    await userEvent.setup().click(screen.getByRole('switch'))
    expect(useAdminMode.getState().enabled).toBe(true)
  })
})
