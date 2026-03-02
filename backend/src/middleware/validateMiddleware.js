const { validationResult } = require("express-validator");

/**
 * validate — middleware factory that runs a chain of express-validator rules,
 * then checks the result and returns a 422 with structured errors if any fail.
 *
 * Usage:
 *   const { body } = require('express-validator');
 *   router.post('/route',
 *     validate([
 *       body('email').isEmail().withMessage('Must be a valid email'),
 *       body('password').isLength({ min: 8 }).withMessage('Min 8 chars'),
 *     ]),
 *     controller
 *   );
 *
 * @param {import('express-validator').ValidationChain[]} rules
 */
const validate = (rules) => async (req, res, next) => {
  // Run all validation rules in parallel
  await Promise.all(rules.map((rule) => rule.run(req)));

  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  return res.status(422).json({
    success: false,
    message: "Validation failed",
    errors: errors.array().map(({ path, msg }) => ({ field: path, message: msg })),
  });
};

module.exports = validate;
