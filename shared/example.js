/**
 * Example of a variable that both the frontend and backend can import.
 *
 * Caveats:
 * - if any shared js file imports an npm package, BOTH frontend and backend need to depend on it in their
 *   package.jsons
 * - shared .jsx files are not supported, because .jsx requires a compilation process that is not yet set up in the
 *   backend
 */
export const SHARED_TEST = "hello";
