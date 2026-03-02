
const mongoose = require('mongoose');
const User = require('./src/models/User');
require('dotenv').config();

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  let user = await User.findOne({ email: 'dev_tester_final@example.com' });
  if (!user) {
    user = await User.create({
      name: 'Dev Tester',
      email: 'dev_tester_final@example.com',
      password: 'password123'
    });
    console.log('Created test user');
  }

  const embedding = Array(15).fill(0.5);
  const personalityProfile = 'Test personality';

  user.preferenceEmbedding = embedding;
  user.personalityProfile = personalityProfile;
  await user.save();

  const updatedUser = await User.findById(user._id);
  console.log('Updated user preferenceEmbedding length:', updatedUser.preferenceEmbedding.length);
  console.log('Updated user personalityProfile:', updatedUser.personalityProfile);

  await mongoose.disconnect();
}

test().catch(console.error);
