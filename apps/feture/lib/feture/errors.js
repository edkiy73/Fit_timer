// @ts-check
'use strict';
class DomainError extends Error {
  /** @param {number} status @param {string} code */
  constructor(status, code) { super(code); this.status=status; this.code=code; }
}
/** @param {number} status @param {string} code @returns {never} */
const reject = (status,code) => { throw new DomainError(status,code); };
module.exports={DomainError,reject};
