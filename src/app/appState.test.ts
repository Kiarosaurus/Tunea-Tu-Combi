import { describe, expect, it, vi } from 'vitest';
import { AppStateMachine } from './appState';

describe('AppStateMachine', () => {
  it('recorre el flujo base hasta el taller', () => {
    const machine = new AppStateMachine();

    machine.transition('MENU');
    machine.transition('LEVEL_SELECT');
    machine.transition('WORKSHOP');

    expect(machine.state).toBe('WORKSHOP');
  });

  it('rechaza saltos que el flujo no permite', () => {
    const machine = new AppStateMachine();

    expect(() => machine.transition('WORKSHOP')).toThrow(
      'Transición inválida: BOOT -> WORKSHOP',
    );
  });

  it('notifica el estado inicial y los cambios aceptados', () => {
    const machine = new AppStateMachine();
    const listener = vi.fn();
    const unsubscribe = machine.subscribe(listener);

    machine.transition('MENU');
    unsubscribe();
    machine.transition('LEVEL_SELECT');

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, 'BOOT');
    expect(listener).toHaveBeenNthCalledWith(2, 'MENU');
  });
});
