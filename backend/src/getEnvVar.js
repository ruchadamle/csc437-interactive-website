import dotenv from "dotenv";

dotenv.config(); // Read the .env file in the current working directory, and load values into process.env.
// Even if this file is imported in multiple places, this will run only once.

/**
 * Gets the value of the environment variable with the specified name, or `undefined` if it isn't set.
 *
 * @param varName - the name of the environment variable to read
 * @param warnIfNotSet - whether to print a warning to the console if the variable isn't set (default true)
 * @returns {string} the value of the environment variable, or `undefined` if it isn't set
 */
export function getEnvVar(varName, warnIfNotSet=true) {
    const value = process.env[varName];
    if (warnIfNotSet && !value) {
        console.warn(`No such environment variable: ${varName}`);
    }
    return value;
}
