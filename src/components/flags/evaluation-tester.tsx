'use client'

import { FlaskConical } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { evaluate } from '@/lib/flags/evaluate'
import type { TargetingState } from '@/lib/flags/targeting-reducer'
import type { EvaluationReason } from '@/lib/flags/types'

import type { VariantOption } from './targeting-editor'

const REASON_COPY: Record<EvaluationReason, { label: string; tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' }> = {
  FLAG_ARCHIVED: { label: 'Flag archived', tone: 'danger' },
  FLAG_OFF: { label: 'Flag is off', tone: 'neutral' },
  RULE_MATCH: { label: 'Matched a rule', tone: 'accent' },
  ROLLOUT: { label: 'Percentage rollout', tone: 'warning' },
  DEFAULT: { label: 'Fell through to default', tone: 'neutral' },
  ERROR: { label: 'Configuration error', tone: 'danger' },
}

/**
 * Runs the real evaluator in the browser against the saved configuration.
 *
 * This is possible because the engine is pure and has no server dependencies —
 * the same function the API would call. It answers the question people
 * actually have before shipping a rollout: "what would *this* user get?"
 */
export function EvaluationTester({
  flagKey,
  archived,
  variants,
  targeting,
}: {
  flagKey: string
  archived: boolean
  variants: VariantOption[]
  targeting: TargetingState
}) {
  const [contextKey, setContextKey] = React.useState('user-1')
  const [attributesText, setAttributesText] = React.useState(
    '{\n  "email": "ana@northwind.test",\n  "plan": "pro"\n}',
  )

  const parsed = React.useMemo(() => {
    if (attributesText.trim() === '') return { ok: true as const, value: {} }

    try {
      const value: unknown = JSON.parse(attributesText)
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return { ok: false as const, error: 'Attributes must be a JSON object.' }
      }
      return { ok: true as const, value: value as Record<string, never> }
    } catch {
      return { ok: false as const, error: 'That is not valid JSON.' }
    }
  }, [attributesText])

  const result = React.useMemo(() => {
    if (!parsed.ok) return null

    return evaluate(
      { key: flagKey, archived, variants },
      {
        enabled: targeting.enabled,
        defaultVariantKey: targeting.defaultVariantKey,
        offVariantKey: targeting.offVariantKey,
        rules: targeting.rules,
        rollout: targeting.rollout,
      },
      { key: contextKey, attributes: parsed.value },
    )
  }, [parsed, flagKey, archived, variants, targeting, contextKey])

  return (
    <Card className="h-fit lg:sticky lg:top-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="size-4 text-accent" aria-hidden="true" />
          Test a context
        </CardTitle>
        <p className="pt-1 text-sm text-fg-muted">
          Runs the saved configuration through the real evaluator.
        </p>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tester-key">Context key</Label>
          <Input
            id="tester-key"
            value={contextKey}
            onChange={(event) => setContextKey(event.target.value)}
            className="font-mono text-xs"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tester-attributes">Attributes</Label>
          <Textarea
            id="tester-attributes"
            value={attributesText}
            onChange={(event) => setAttributesText(event.target.value)}
            rows={6}
            spellCheck={false}
            aria-invalid={!parsed.ok}
            aria-describedby={parsed.ok ? undefined : 'tester-attributes-error'}
            className="font-mono text-xs"
          />
          {!parsed.ok ? (
            <p id="tester-attributes-error" className="text-xs text-danger">
              {parsed.error}
            </p>
          ) : null}
        </div>

        {/* aria-live so the outcome is announced as the inputs change. */}
        <div
          aria-live="polite"
          className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-border bg-surface-raised p-3"
        >
          {result ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
                  Serves
                </span>
                <Badge tone={REASON_COPY[result.reason].tone}>
                  {REASON_COPY[result.reason].label}
                </Badge>
              </div>

              <p className="font-mono text-sm font-medium text-fg">{result.variantKey}</p>

              <p className="font-mono text-xs text-fg-muted">
                {JSON.stringify(result.value)}
              </p>

              {result.ruleIndex !== undefined ? (
                <p className="text-xs text-fg-muted">Rule {result.ruleIndex + 1} matched.</p>
              ) : null}

              {result.bucket !== undefined ? (
                <p className="text-xs text-fg-muted">Landed in bucket {result.bucket} of 100.</p>
              ) : null}

              {result.error ? <p className="text-xs text-danger">{result.error}</p> : null}
            </>
          ) : (
            <p className="text-sm text-fg-muted">Fix the attributes to see a result.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
