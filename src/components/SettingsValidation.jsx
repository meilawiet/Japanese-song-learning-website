import { useId, useState } from 'react'

export function useSettingsValidation() {
  const prefix = useId()
  const [error, setError] = useState(null)
  function validate(container, extra) {
    if (!container) return false
    for (const input of container.querySelectorAll('input[data-settings-field]')) {
      if (input.matches(':disabled') || !input.willValidate) continue
      const { settingsField: key, settingsLabel: label } = input.dataset
      const text = input.validity.valueMissing || (input.required && input.type !== 'password' && !input.value.trim())
        ? '请填写' + label + '。'
        : !input.validity.valid ? '请输入有效的' + label + '。' : extra?.(input)
      if (text) {
        setError({ key, label, text, input })
        input.focus()
        return false
      }
    }
    setError(null)
    return true
  }
  return {
    validate,
    clear: () => setError(null),
    field: (key, label) => ({
      'data-settings-field': key, 'data-settings-label': label,
      'aria-label': label, 'aria-invalid': error?.key === key || undefined,
      'aria-describedby': error?.key === key ? prefix + '-' + key : undefined,
    }),
    message: key => error?.key === key
      ? <span className="settings-field-error" id={prefix + '-' + key}>{error.text}</span> : null,
    summary: error ? <div className="settings-validation-summary" role="alert">
      <span>请检查一处设置</span>
      <button type="button" onClick={() => error.input.focus()}>定位到{error.label}</button>
    </div> : null,
  }
}
