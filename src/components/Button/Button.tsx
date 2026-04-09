import React from 'react'
import styles from './Button.module.css'

// ─── Types ───────────────────────────────────────────────────────────────────

export type ButtonVariant = 'primary' | 'secondary' | 'knockout'
export type ButtonSize    = 'sm' | 'md' | 'lg'
export type ButtonRadius  = 'sm' | 'md' | 'lg' | 'xlg' | 'round'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style: filled (primary), outlined (secondary), or inverse (knockout) */
  variant?: ButtonVariant
  /** Height / padding scale */
  size?: ButtonSize
  /** Border-radius preset */
  radius?: ButtonRadius
  /** Label text */
  label?: string
  /** Icon element rendered before the label */
  icon?: React.ReactNode
  /** Renders a square icon-only button (hides label) */
  iconOnly?: boolean
  /** Stretches to full container width */
  fullWidth?: boolean
}

// ─── Component ───────────────────────────────────────────────────────────────

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant   = 'primary',
      size      = 'md',
      radius    = 'md',
      label,
      icon,
      iconOnly  = false,
      fullWidth = false,
      className,
      disabled,
      children,
      ...rest
    },
    ref
  ) => {
    const classNames = [
      styles.button,
      styles[`variant-${variant}`],
      styles[`size-${size}`],
      styles[`radius-${radius}`],
      fullWidth  ? styles.fullWidth  : '',
      iconOnly   ? styles.iconOnly   : '',
      className  ?? '',
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <button
        ref={ref}
        className={classNames}
        disabled={disabled}
        aria-disabled={disabled}
        {...rest}
      >
        {icon && <span className={styles.icon} aria-hidden="true">{icon}</span>}
        {!iconOnly && (
          <span className={styles.label}>{label ?? children}</span>
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'
export default Button
