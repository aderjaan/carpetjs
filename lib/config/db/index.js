/*
 * Expose the correct mongodb connection string in every case
 */
module.exports = config => {
  const env = process.env.NODE_ENV;
  const test = ['docs', 'test'].includes(env);
  const ci = process.env.CI === 'true';
  const url = process.env.MONGOHQ_URL || process.env.MONGODB_URL;

  if (url && ['testing', 'staging', 'production'].indexOf(env) < 0 && !/localhost/.test(url)) {
    global.console.error('Make sure you always use a local database for development purposes!');
    throw new Error('Refusing to connect to a non localhost database!');
  }

  if ((!test || ci) && url) {
    return url;
  }

  let dbname = process.env.DB_NAME || config.identifier;

  if (test) {
    dbname = `${dbname}_${env}`;
  }

  return `mongodb://localhost/${dbname}`;
};
