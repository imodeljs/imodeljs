/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Utilities
 */

import * as React from "react";
import { hasPointerEventsSupport, Timer } from "../../../ui-core";

/** @public */
export type OutsideClickEvent = PointerEvent | MouseEvent | TouchEvent;

/** Invokes onOutsideClick handler when user clicks outside of referenced element.
 * @public
 */
export function useOnOutsideClick<T extends Element>(
  onOutsideClick?: () => void,
  /** Invoked for intermediate events. Return `false` to prevent outside click. */
  outsideEventPredicate?: (e: OutsideClickEvent) => boolean,
) {
  const handleMouseEvents = React.useRef(true);
  const handleMouseEventsTimer = React.useRef(new Timer(1000));
  const ref = React.useRef<T>(null);
  const isDownOutside = React.useRef(false);
  React.useEffect(() => {
    const listener = (e: OutsideClickEvent) => {
      if (e.type === "touchstart") {
        // Skip mouse event handlers after touch event.
        handleMouseEvents.current = false;
        handleMouseEventsTimer.current.start();
      } else if (e.type === "mousedown" && !handleMouseEvents.current) {
        return;
      }
      const isOutsideEvent = !outsideEventPredicate || outsideEventPredicate(e);
      isDownOutside.current = (!!ref.current && (e.target instanceof Node) && !ref.current.contains(e.target)) && isOutsideEvent;
    };
    if (hasPointerEventsSupport()) {
      document.addEventListener("pointerdown", listener);
    } else {
      document.addEventListener("mousedown", listener);
      document.addEventListener("touchstart", listener);
    }
    return () => {
      if (hasPointerEventsSupport()) {
        document.removeEventListener("pointerdown", listener);
      } else {
        document.removeEventListener("mousedown", listener);
        document.removeEventListener("touchstart", listener);
      }
    };
  }, [outsideEventPredicate]);
  React.useEffect(() => {
    const listener = (e: OutsideClickEvent) => {
      if (e.type === "mouseup" && !handleMouseEvents.current) {
        return;
      }
      onOutsideClick && isDownOutside.current && (!outsideEventPredicate || outsideEventPredicate(e)) &&
        ref.current && e.target instanceof Node && !ref.current.contains(e.target) && onOutsideClick();
      isDownOutside.current = false;
    };
    if (hasPointerEventsSupport()) {
      document.addEventListener("pointerup", listener);
    } else {
      document.addEventListener("mouseup", listener);
      document.addEventListener("touchend", listener);
    }
    return () => {
      if (hasPointerEventsSupport()) {
        document.removeEventListener("pointerup", listener);
      } else {
        document.removeEventListener("mouseup", listener);
        document.removeEventListener("touchend", listener);
      }
    };
  }, [onOutsideClick, outsideEventPredicate]);
  React.useEffect(() => {
    const listener = () => {
      handleMouseEvents.current = true;
    };
    const timer = handleMouseEventsTimer.current;
    timer.setOnExecute(listener);
    return () => {
      timer.setOnExecute(undefined);
    };
  }, []);
  return ref;
}
