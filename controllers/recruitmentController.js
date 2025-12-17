const TeamRecruitment = require('../models/TeamRecruitment');
const PlayerProfile = require('../models/PlayerProfile');
const RecruitmentApplication = require('../models/RecruitmentApplication');
const User = require('../models/User');
const safeAsyncHandler = require('../utils/safeAsyncHandler');

// Team Recruitment Controllers

// Create team recruitment post
const createTeamRecruitment = safeAsyncHandler(async (req, res) => {
  const { recruitmentType, game, role, staffRole, requirements, benefits } = req.body;
  const teamId = req.user._id;

  // Validate team user
  if (req.user.userType !== 'team') {
    return res.status(400).json({
      success: false,
      message: 'Only teams can create recruitment posts'
    });
  }

  // Validate required fields based on recruitment type
  if (recruitmentType === 'staff' && !staffRole) {
    return res.status(400).json({
      success: false,
      message: 'Staff role is required for staff recruitment'
    });
  }

  if (recruitmentType === 'roster' && !role) {
    return res.status(400).json({
      success: false,
      message: 'Role is required for roster recruitment'
    });
  }

  const recruitment = new TeamRecruitment({
    team: teamId,
    recruitmentType,
    game,
    role: recruitmentType === 'roster' ? role : undefined,
    staffRole: recruitmentType === 'staff' ? staffRole : undefined,
    requirements,
    benefits
  });

  await recruitment.save();

  // Populate team information
  await recruitment.populate('team', 'username profile.displayName profile.avatar');

  res.status(201).json({
    success: true,
    message: 'Recruitment post created successfully',
    data: recruitment
  });
});

// Get all team recruitments with filters
const getTeamRecruitments = safeAsyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    game,
    recruitmentType,
    location,
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  const query = { status: 'active', isActive: true };

  // Apply filters
  if (game) query.game = game;
  if (recruitmentType) query.recruitmentType = recruitmentType;
  if (location) query['benefits.location'] = { $regex: location, $options: 'i' };

  // Search functionality
  if (search) {
    query.$or = [
      { role: { $regex: search, $options: 'i' } },
      { staffRole: { $regex: search, $options: 'i' } },
      { 'requirements.additionalRequirements': { $regex: search, $options: 'i' } }
    ];
  }

  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

  const recruitments = await TeamRecruitment.find(query)
    .populate('team', 'username profile.displayName profile.avatar')
    .sort(sortOptions)
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await TeamRecruitment.countDocuments(query);

  res.json({
    success: true,
    data: {
      recruitments,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalRecruitments: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    }
  });
});

// Get single team recruitment
const getTeamRecruitment = safeAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const recruitment = await TeamRecruitment.findById(id)
    .populate('team', 'username profile.displayName profile.avatar profile.bio teamInfo.teamType')
    .populate('applicants.user', 'username profile.displayName profile.avatar');

  if (!recruitment) {
    return res.status(404).json({
      success: false,
      message: 'Recruitment post not found'
    });
  }

  // Increment view count
  recruitment.views += 1;
  await recruitment.save();

  res.json({
    success: true,
    data: recruitment
  });
});

// Update team recruitment
const updateTeamRecruitment = safeAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const teamId = req.user._id;

  const recruitment = await TeamRecruitment.findById(id);

  if (!recruitment) {
    return res.status(404).json({
      success: false,
      message: 'Recruitment post not found'
    });
  }

  if (recruitment.team.toString() !== teamId.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update this recruitment post'
    });
  }

  const updatedRecruitment = await TeamRecruitment.findByIdAndUpdate(
    id,
    req.body,
    { new: true, runValidators: true }
  ).populate('team', 'username profile.displayName profile.avatar');

  res.json({
    success: true,
    message: 'Recruitment post updated successfully',
    data: updatedRecruitment
  });
});

// Delete team recruitment
const deleteTeamRecruitment = safeAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const teamId = req.user._id;

  const recruitment = await TeamRecruitment.findById(id);

  if (!recruitment) {
    return res.status(404).json({
      success: false,
      message: 'Recruitment post not found'
    });
  }

  if (recruitment.team.toString() !== teamId.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to delete this recruitment post'
    });
  }

  await TeamRecruitment.findByIdAndDelete(id);

  res.json({
    success: true,
    message: 'Recruitment post deleted successfully'
  });
});

// Player Profile Controllers

// Create player profile
const createPlayerProfile = safeAsyncHandler(async (req, res) => {
  const { profileType, game, role, staffRole, playerInfo, professionalInfo, expectations } = req.body;
  const playerId = req.user._id;

  // Validate player user
  if (req.user.userType !== 'player') {
    return res.status(400).json({
      success: false,
      message: 'Only players can create profiles'
    });
  }

  // Validate required fields based on profile type
  if (profileType === 'staff-position' && !staffRole) {
    return res.status(400).json({
      success: false,
      message: 'Staff role is required for staff position profile'
    });
  }

  if (profileType === 'looking-for-team' && !role) {
    return res.status(400).json({
      success: false,
      message: 'Role is required for looking for team profile'
    });
  }

  const profile = new PlayerProfile({
    player: playerId,
    profileType,
    game,
    role: profileType === 'looking-for-team' ? role : undefined,
    staffRole: profileType === 'staff-position' ? staffRole : undefined,
    playerInfo: profileType === 'looking-for-team' ? playerInfo : undefined,
    professionalInfo: profileType === 'staff-position' ? professionalInfo : undefined,
    expectations
  });

  await profile.save();

  // Populate player information
  await profile.populate('player', 'username profile.displayName profile.avatar');

  res.status(201).json({
    success: true,
    message: 'Player profile created successfully',
    data: profile
  });
});

// Get all player profiles with filters
const getPlayerProfiles = safeAsyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    game,
    profileType,
    location,
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  const query = { status: 'active', isActive: true };

  // Apply filters
  if (game) query.game = game;
  if (profileType) query.profileType = profileType;
  if (location) query['expectations.preferredLocation'] = { $regex: location, $options: 'i' };

  // Search functionality
  if (search) {
    query.$or = [
      { role: { $regex: search, $options: 'i' } },
      { staffRole: { $regex: search, $options: 'i' } },
      { 'playerInfo.additionalInfo': { $regex: search, $options: 'i' } },
      { 'professionalInfo.skillsAndExpertise': { $regex: search, $options: 'i' } }
    ];
  }

  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

  const profiles = await PlayerProfile.find(query)
    .populate('player', 'username profile.displayName profile.avatar')
    .sort(sortOptions)
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .lean();

  const total = await PlayerProfile.countDocuments(query);

  res.json({
    success: true,
    data: {
      profiles,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalProfiles: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    }
  });
});

// Get single player profile
const getPlayerProfile = safeAsyncHandler(async (req, res) => {
  const { id } = req.params;

  const profile = await PlayerProfile.findById(id)
    .populate('player', 'username profile.displayName profile.avatar profile.bio')
    .populate('interestedTeams.team', 'username profile.displayName profile.avatar');

  if (!profile) {
    return res.status(404).json({
      success: false,
      message: 'Player profile not found'
    });
  }

  // Increment view count
  profile.views += 1;
  await profile.save();

  res.json({
    success: true,
    data: profile
  });
});

// Update player profile
const updatePlayerProfile = safeAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const playerId = req.user._id;

  const profile = await PlayerProfile.findById(id);

  if (!profile) {
    return res.status(404).json({
      success: false,
      message: 'Player profile not found'
    });
  }

  if (profile.player.toString() !== playerId.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update this profile'
    });
  }

  const updatedProfile = await PlayerProfile.findByIdAndUpdate(
    id,
    req.body,
    { new: true, runValidators: true }
  ).populate('player', 'username profile.displayName profile.avatar');

  res.json({
    success: true,
    message: 'Player profile updated successfully',
    data: updatedProfile
  });
});

// Delete player profile
const deletePlayerProfile = safeAsyncHandler(async (req, res) => {
  const { id } = req.params;
  const playerId = req.user._id;

  const profile = await PlayerProfile.findById(id);

  if (!profile) {
    return res.status(404).json({
      success: false,
      message: 'Player profile not found'
    });
  }

  if (profile.player.toString() !== playerId.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to delete this profile'
    });
  }

  await PlayerProfile.findByIdAndDelete(id);

  res.json({
    success: true,
    message: 'Player profile deleted successfully'
  });
});

// Application Controllers

// Apply to team recruitment
const applyToRecruitment = safeAsyncHandler(async (req, res) => {
  const { recruitmentId } = req.params;
  const { message, resume, portfolio } = req.body;
  const applicantId = req.user._id;

  // Check if recruitment exists
  const recruitment = await TeamRecruitment.findById(recruitmentId);
  if (!recruitment) {
    return res.status(404).json({
      success: false,
      message: 'Recruitment post not found'
    });
  }

  // Check if user already applied
  const existingApplication = await RecruitmentApplication.findOne({
    applicant: applicantId,
    recruitment: recruitmentId,
    isActive: true
  });

  if (existingApplication) {
    return res.status(400).json({
      success: false,
      message: 'You have already applied to this recruitment'
    });
  }

  const application = new RecruitmentApplication({
    applicant: applicantId,
    recruitment: recruitmentId,
    applicationType: 'team-recruitment',
    message,
    resume,
    portfolio
  });

  await application.save();

  // Add to recruitment's applicants list
  recruitment.applicants.push({
    user: applicantId,
    appliedAt: new Date(),
    status: 'pending',
    message,
    resume,
    portfolio
  });

  await recruitment.save();

  res.status(201).json({
    success: true,
    message: 'Application submitted successfully',
    data: application
  });
});

// Show interest in player profile
const showInterestInProfile = safeAsyncHandler(async (req, res) => {
  const { profileId } = req.params;
  const { message } = req.body;
  const teamId = req.user._id;

  // Validate team user
  if (req.user.userType !== 'team') {
    return res.status(400).json({
      success: false,
      message: 'Only teams can show interest in player profiles'
    });
  }

  // Check if profile exists
  const profile = await PlayerProfile.findById(profileId);
  if (!profile) {
    return res.status(404).json({
      success: false,
      message: 'Player profile not found'
    });
  }

  // Check if team already showed interest
  const existingInterest = profile.interestedTeams.find(
    interest => interest.team.toString() === teamId.toString()
  );

  if (existingInterest) {
    return res.status(400).json({
      success: false,
      message: 'You have already shown interest in this profile'
    });
  }

  profile.interestedTeams.push({
    team: teamId,
    interestedAt: new Date(),
    status: 'pending',
    message
  });

  await profile.save();

  res.json({
    success: true,
    message: 'Interest shown successfully'
  });
});

// Get user's applications
const getUserApplications = safeAsyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 10, status } = req.query;

  const query = { applicant: userId, isActive: true };
  if (status) query.status = status;

  const applications = await RecruitmentApplication.find(query)
    .populate('recruitment', 'game role staffRole recruitmentType team')
    .populate('recruitment.team', 'username profile.displayName profile.avatar')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await RecruitmentApplication.countDocuments(query);

  res.json({
    success: true,
    data: {
      applications,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalApplications: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    }
  });
});

// Get team's recruitment applications
const getTeamApplications = safeAsyncHandler(async (req, res) => {
  const teamId = req.user._id;
  const { recruitmentId, page = 1, limit = 10, status } = req.query;

  // Validate team user
  if (req.user.userType !== 'team') {
    return res.status(400).json({
      success: false,
      message: 'Only teams can view applications'
    });
  }

  let query = { isActive: true };

  if (recruitmentId) {
    // Get applications for specific recruitment
    const recruitment = await TeamRecruitment.findById(recruitmentId);
    if (!recruitment || recruitment.team.toString() !== teamId.toString()) {
      return res.status(404).json({
        success: false,
        message: 'Recruitment not found or not authorized'
      });
    }
    query.recruitment = recruitmentId;
  } else {
    // Get all applications for team's recruitments
    const teamRecruitments = await TeamRecruitment.find({ team: teamId }).select('_id');
    query.recruitment = { $in: teamRecruitments.map(r => r._id) };
  }

  if (status) query.status = status;

  const applications = await RecruitmentApplication.find(query)
    .populate('applicant', 'username profile.displayName profile.avatar')
    .populate('recruitment', 'game role staffRole recruitmentType')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await RecruitmentApplication.countDocuments(query);

  res.json({
    success: true,
    data: {
      applications,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalApplications: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    }
  });
});

// Update application status
const updateApplicationStatus = safeAsyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const { status, message } = req.body;
  const teamId = req.user._id;

  // Validate team user
  if (req.user.userType !== 'team') {
    return res.status(400).json({
      success: false,
      message: 'Only teams can update application status'
    });
  }

  const application = await RecruitmentApplication.findById(applicationId)
    .populate('recruitment');

  if (!application) {
    return res.status(404).json({
      success: false,
      message: 'Application not found'
    });
  }

  // Check if team owns the recruitment
  if (application.recruitment.team.toString() !== teamId.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update this application'
    });
  }

  application.status = status;
  application.teamResponse = {
    message,
    respondedAt: new Date(),
    respondedBy: teamId
  };

  await application.save();

  // Update status in recruitment's applicants list
  const recruitment = await TeamRecruitment.findById(application.recruitment._id);
  const applicant = recruitment.applicants.find(
    app => app.user.toString() === application.applicant.toString()
  );
  if (applicant) {
    applicant.status = status;
    await recruitment.save();
  }

  res.json({
    success: true,
    message: 'Application status updated successfully',
    data: application
  });
});

module.exports = {
  // Team Recruitment
  createTeamRecruitment,
  getTeamRecruitments,
  getTeamRecruitment,
  updateTeamRecruitment,
  deleteTeamRecruitment,
  
  // Player Profile
  createPlayerProfile,
  getPlayerProfiles,
  getPlayerProfile,
  updatePlayerProfile,
  deletePlayerProfile,
  
  // Applications
  applyToRecruitment,
  showInterestInProfile,
  getUserApplications,
  getTeamApplications,
  updateApplicationStatus
};
