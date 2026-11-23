/**
 * Chrome's automatic translation wraps text nodes in <font>. React then
 * calls removeChild/insertBefore on a node whose parent is no longer the
 * one it rendered (facebook/react#11538) and the wizard error boundary
 * catches NotFoundError. This guard no-ops that mismatch.
 *
 * Load it before hydration. translate="no" is not a substitute: the test
 * still wraps text nodes in <font>.
 */

type NodeParent = {
  parentNode: NodeParent | null;
  removeChild: (child: NodeParent) => NodeParent;
  insertBefore: (node: NodeParent, child: NodeParent | null) => NodeParent;
};

export function installTranslateDomGuard(prototype: NodeParent = Node.prototype as unknown as NodeParent): void {
  const removeChild = prototype.removeChild;
  const insertBefore = prototype.insertBefore;
  prototype.removeChild = function removeChildGuarded(child: NodeParent) {
    if (child.parentNode !== this) {
      console.warn('translate guard: skip removeChild', child, this);
      return child;
    }
    return removeChild.call(this, child);
  };
  prototype.insertBefore = function insertBeforeGuarded(node: NodeParent, reference: NodeParent | null) {
    if (reference && reference.parentNode !== this) {
      console.warn('translate guard: skip insertBefore', reference, this);
      return node;
    }
    return insertBefore.call(this, node, reference);
  };
}

/** Inline script for the root layout. Runs before React hydrates. */
export const TRANSLATE_DOM_GUARD_SCRIPT = `(()=>{if(window.__lfTranslateGuard)return;window.__lfTranslateGuard=1;var p=Node.prototype,rc=p.removeChild,ib=p.insertBefore;p.removeChild=function(c){if(c.parentNode!==this){console.warn('translate guard: skip removeChild',c,this);return c;}return rc.call(this,c);};p.insertBefore=function(n,r){if(r&&r.parentNode!==this){console.warn('translate guard: skip insertBefore',r,this);return n;}return ib.call(this,n,r);};})();`;
