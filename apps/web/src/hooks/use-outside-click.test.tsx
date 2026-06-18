import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { useOutsideClick } from './use-outside-click';
import { fireEvent } from '@testing-library/react';
import { render } from '@testing-library/react';

describe('useOutsideClick', () => {
  it('fires onOutside when click lands outside the ref element', () => {
    const onOutside = vi.fn();
    const { result } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(null);
      useOutsideClick(ref, onOutside, true);
      return ref;
    });
    const { getByTestId } = render(
      <div>
        <div data-testid="inside" ref={result.current}>
          inside
        </div>
        <div data-testid="outside">outside</div>
      </div>
    );
    fireEvent.mouseDown(getByTestId('outside'));
    expect(onOutside).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onOutside when click lands inside the ref element', () => {
    const onOutside = vi.fn();
    const { result } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(null);
      useOutsideClick(ref, onOutside, true);
      return ref;
    });
    const { getByTestId } = render(
      <div>
        <div data-testid="inside" ref={result.current}>
          inside
        </div>
      </div>
    );
    fireEvent.mouseDown(getByTestId('inside'));
    expect(onOutside).not.toHaveBeenCalled();
  });

  it('does NOT fire when active is false', () => {
    const onOutside = vi.fn();
    const { result } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(null);
      useOutsideClick(ref, onOutside, false);
      return ref;
    });
    const { getByTestId } = render(
      <div>
        <div data-testid="inside" ref={result.current}>
          inside
        </div>
        <div data-testid="outside">outside</div>
      </div>
    );
    fireEvent.mouseDown(getByTestId('outside'));
    expect(onOutside).not.toHaveBeenCalled();
  });
});
