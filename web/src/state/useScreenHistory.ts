import { useEffect, useRef, useState } from 'react'
import { ScreenHistory, type Screen } from './screenHistory'

export function useScreenHistory(initial: Screen = 'paste') {
  // Guarded ref-lazy singleton, not useMemo: the constructor has side effects
  // (seeds history.state, attaches a popstate listener), and React 18
  // StrictMode's dev-mode double-render would otherwise construct it twice,
  // leaking a duplicate listener.
  const controllerRef = useRef<ScreenHistory | null>(null)
  if (!controllerRef.current) {
    controllerRef.current = new ScreenHistory(window, initial)
  }
  const controller = controllerRef.current

  const [screen, setScreen] = useState<Screen>(controller.screen)

  useEffect(() => {
    const unsubscribe = controller.subscribe(setScreen)
    setScreen(controller.screen)
    return unsubscribe
  }, [controller])

  return { screen, go: controller.go.bind(controller), replace: controller.replace.bind(controller) }
}
