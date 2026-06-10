const errorHandler = (err, req, res, next) => {
  console.error('[Error]', err.stack || err.message);
  
  if (err.name === 'ZodError') {
    return res.status(400).json({
      message: 'Validation Error',
      errors: err.errors,
    });
  }

  res.status(500).json({
    message: err.message || 'Internal Server Error',
  });
};

module.exports = errorHandler;
