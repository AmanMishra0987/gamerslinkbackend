const Tournament = require('../models/Tournament');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { emitNotification } = require('../utils/notificationEmitter');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/tournaments';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'banner-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
}).single('banner');

// Create new tournament
const createTournament = async (req, res) => {
  try {
    upload(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }

      // Debug: Log the request body
      console.log('Request body:', req.body);
      console.log('Request file:', req.file);

      const {
        name,
        description,
        game,
        mode,
        format,
        startDate,
        endDate,
        registrationDeadline,
        location,
        timezone,
        prizePool,
        entryFee,
        totalSlots,
        teamsPerGroup,
        numberOfGroups,
        prizePoolType,
        rules
      } = req.body;

    const hostId = req.user._id;

    // Validate dates
    const now = new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);
    const deadline = new Date(registrationDeadline);

    if (start <= now) {
      return res.status(400).json({
        success: false,
        message: 'Tournament start date must be in the future'
      });
    }

    if (end <= start) {
      return res.status(400).json({
        success: false,
        message: 'End date must be after start date'
      });
    }

    if (deadline >= start) {
      return res.status(400).json({
        success: false,
        message: 'Registration deadline must be before start date'
      });
    }

    // Validate prize pool for prize tournaments
    if (prizePoolType === 'with_prize' && (!prizePool || prizePool < 100)) {
      return res.status(400).json({
        success: false,
        message: 'Prize pool must be at least ₹100 for prize tournaments'
      });
    }

    // Get total rounds
    const totalRounds = parseInt(req.body.totalRounds) || 1;

    // Create tournament
    const tournamentData = {
      name,
      description,
      game,
      mode: mode || null,
      format,
      startDate: start,
      endDate: end,
      registrationDeadline: deadline,
      location: location || 'Online',
      timezone: timezone || 'UTC',
      prizePool: prizePoolType === 'with_prize' ? (prizePool || 0) : 0,
      entryFee: entryFee || 0,
      totalSlots: parseInt(totalSlots),
      teamsPerGroup: parseInt(teamsPerGroup),
      numberOfGroups: parseInt(numberOfGroups),
      totalRounds: totalRounds,
      prizePoolType,
      host: hostId,
      banner: req.file ? req.file.filename : null,
      rules: rules ? rules.split(',').map(rule => rule.trim()) : [],
      status: 'Upcoming'
    };

    const tournament = await Tournament.create(tournamentData);
    
    // Calculate number of groups based on totalSlots and teamsPerGroup
    const calculatedGroups = Math.ceil(parseInt(totalSlots) / parseInt(teamsPerGroup));
    console.log('Creating tournament with:', { totalSlots, teamsPerGroup, calculatedGroups, totalRounds });
    
    // Create groups only for Round 1 initially
    const groups = [];
    for (let i = 0; i < calculatedGroups; i++) {
      groups.push({
        name: `Group ${String.fromCharCode(65 + i)}`, // Group A, B, C, D
        round: 1,
        groupLetter: String.fromCharCode(65 + i),
        participants: [],
        broadcastChannelId: null
      });
    }
    console.log('Created Round 1 groups:', groups);
    
    // Create broadcast channels only for Round 1
    const broadcastChannels = [];
    for (let i = 0; i < calculatedGroups; i++) {
      const channelName = `Group ${String.fromCharCode(65 + i)} - Round 1`;
      broadcastChannels.push({
        name: channelName,
        type: 'Text Messages',
        description: `Broadcast channel for Group ${String.fromCharCode(65 + i)} in Round 1`,
        round: 1,
        groupId: `round_1_group_${i + 1}`,
        channelId: null
      });
    }
    console.log('Created Round 1 broadcast channels:', broadcastChannels);
    
    // Update tournament with groups and broadcast channels
    tournament.groups = groups;
    tournament.broadcastChannels = broadcastChannels;
    await tournament.save();
    console.log('Tournament saved with groups and channels');
    
    // Populate host info
    await tournament.populate('host', 'username profile.displayName profile.avatar');

    res.status(201).json({
      success: true,
      message: 'Tournament created successfully with groups and broadcast channels',
      data: {
        tournament
      }
    });
    });
  } catch (error) {
    console.error('Tournament creation error:', error);
    
    // Handle validation errors specifically
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to create tournament',
      error: error.message
    });
  }
};

// Get all tournaments
const getTournaments = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { status, game, format, search } = req.query;

    // Build filter object
    const filter = {};

    if (status) filter.status = status;
    if (game) filter.game = game;
    if (format) filter.format = format;

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const tournaments = await Tournament.find(filter)
      .populate('host', 'username profile.displayName profile.avatar')
      .populate('participants', 'username profile.displayName profile.avatar')
      .populate('teams', 'username profile.displayName profile.avatar')
      .sort({ startDate: 1 })
      .skip(skip)
      .limit(limit);

    const total = await Tournament.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        tournaments,
        pagination: {
          current: page,
          total: Math.ceil(total / limit),
          count: tournaments.length,
          totalTournaments: total
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tournaments',
      error: error.message
    });
  }
};

// Get single tournament
const getTournament = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id)
      .populate('host', 'username profile.displayName profile.avatar')
      .populate('participants', 'username profile.displayName profile.avatar')
      .populate({
        path: 'teams',
        select: 'username profile.displayName profile.avatar teamInfo',
        populate: {
          path: 'teamInfo.members.user',
          select: 'username profile.displayName profile.avatar'
        }
      })
      .populate('groups.participants', 'username profile.displayName profile.avatar')
      .populate('matches.team1', 'username profile.displayName profile.avatar')
      .populate('matches.team2', 'username profile.displayName profile.avatar')
      .populate('matches.winner', 'username profile.displayName profile.avatar')
      .populate('winners.team', 'username profile.displayName profile.avatar')
      .populate('groupMessages.messages.sender', 'username profile.displayName profile.avatar');

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        tournament
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tournament',
      error: error.message
    });
  }
};

// Get tournament by name and host username
const getTournamentByName = async (req, res) => {
  try {
    const { tournamentName, hostUsername } = req.params;
    
    console.log('getTournamentByName - Request params:', { tournamentName, hostUsername });
    console.log('getTournamentByName - Decoded params:', { 
      tournamentName: decodeURIComponent(tournamentName), 
      hostUsername: decodeURIComponent(hostUsername) 
    });
    
    // Find tournament by name and host username
    const tournament = await Tournament.findOne({
      name: decodeURIComponent(tournamentName),
      'host.username': decodeURIComponent(hostUsername)
    })
      .populate('host', 'username profile.displayName profile.avatar')
      .populate('participants', 'username profile.displayName profile.avatar')
      .populate({
        path: 'teams',
        select: 'username profile.displayName profile.avatar teamInfo',
        populate: {
          path: 'teamInfo.members.user',
          select: 'username profile.displayName profile.avatar'
        }
      })
      .populate('groups.participants', 'username profile.displayName profile.avatar')
      .populate('matches.team1', 'username profile.displayName profile.avatar')
      .populate('matches.team2', 'username profile.displayName profile.avatar')
      .populate('matches.winner', 'username profile.displayName profile.avatar')
      .populate('winners.team', 'username profile.displayName profile.avatar')
      .populate('groupMessages.messages.sender', 'username profile.displayName profile.avatar');

    console.log('getTournamentByName - Tournament found:', !!tournament);
    if (tournament) {
      console.log('getTournamentByName - Tournament ID:', tournament._id);
      console.log('getTournamentByName - Tournament name:', tournament.name);
    }

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        tournament
      }
    });

  } catch (error) {
    console.error('getTournamentByName - Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tournament',
      error: error.message
    });
  }
};

// Update tournament
const updateTournament = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Check if user is the host
    if (tournament.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only tournament host can update tournament'
      });
    }

    // Only allow updates if tournament hasn't started
    if (tournament.status !== 'Upcoming' && tournament.status !== 'Registration Open') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update tournament that has already started'
      });
    }

    const updatedTournament = await Tournament.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('host', 'username profile.displayName profile.avatar');

    res.status(200).json({
      success: true,
      message: 'Tournament updated successfully',
      data: {
        tournament: updatedTournament
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update tournament',
      error: error.message
    });
  }
};

// Join tournament
const joinTournament = async (req, res) => {
  try {
    console.log('Join tournament request:', {
      tournamentId: req.params.id,
      userId: req.user._id,
      userType: req.user.userType,
      username: req.user.username
    });

    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    console.log('Tournament found:', {
      id: tournament._id,
      name: tournament.name,
      status: tournament.status,
      currentParticipants: tournament.participants.length + tournament.teams.length,
      totalSlots: tournament.totalSlots
    });

    // Check if registration is open
    if (tournament.status !== 'Registration Open') {
      return res.status(400).json({
        success: false,
        message: `Tournament registration is not open. Current status: ${tournament.status}`
      });
    }

    // Check if registration deadline has passed
    if (new Date() > tournament.registrationDeadline) {
      return res.status(400).json({
        success: false,
        message: 'Registration deadline has passed'
      });
    }

    const userId = req.user._id;

    // Check if user is already registered
    const isAlreadyRegistered = tournament.participants.includes(userId) || 
                               tournament.teams.includes(userId);

    if (isAlreadyRegistered) {
      return res.status(400).json({
        success: false,
        message: 'You are already registered for this tournament'
      });
    }

    // Check if tournament is full
    const currentParticipants = tournament.participants.length + tournament.teams.length;
    if (currentParticipants >= tournament.totalSlots) {
      return res.status(400).json({
        success: false,
        message: 'Tournament is full'
      });
    }

    // Add user to tournament based on their type and tournament format
    if (req.user.userType === 'team') {
      // Teams can join all tournament formats
      tournament.teams.push(userId);
    } else {
      // Players can only join Solo and Duo tournaments
      if (tournament.format === 'Solo' || tournament.format === 'Duo') {
        tournament.participants.push(userId);
      } else {
        return res.status(400).json({
          success: false,
          message: 'Players can only join Solo and Duo tournaments. For Squad tournaments, please join as a team.'
        });
      }
    }

    await tournament.save();

    // Send notification to host
    const notification = await Notification.createNotification({
      recipient: tournament.host,
      sender: userId,
      type: 'system',
      title: 'New Tournament Registration',
      message: `${req.user.username} has joined your tournament "${tournament.name}"`,
      data: {
        tournamentId: tournament._id,
        customData: { action: 'tournament_join' }
      }
    });
    
    // Emit real-time notification
    emitNotification(tournament.host, notification);

    res.status(200).json({
      success: true,
      message: 'Successfully joined tournament'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to join tournament',
      error: error.message
    });
  }
};

// Leave tournament
const leaveTournament = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    const userId = req.user._id;

    // Check if user is registered as individual participant
    const isIndividualParticipant = tournament.participants.includes(userId);
    
    // Check if user is part of any team
    const userTeam = tournament.teams.find(teamId => {
      // We need to populate teams to check members
      return false; // This will be handled in the next step
    });

    if (!isIndividualParticipant && !userTeam) {
      return res.status(400).json({
        success: false,
        message: 'You are not registered for this tournament'
      });
    }

    // Remove user from individual participants
    if (isIndividualParticipant) {
      tournament.participants = tournament.participants.filter(id => id.toString() !== userId.toString());
    }

    await tournament.save();

    res.status(200).json({
      success: true,
      message: 'Successfully left tournament'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to leave tournament',
      error: error.message
    });
  }
};

// Leave tournament as team
const leaveTournamentAsTeam = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    const { teamId } = req.body;
    const userId = req.user._id;

    if (!teamId) {
      return res.status(400).json({
        success: false,
        message: 'Team ID is required'
      });
    }

    // Find the team and verify user is a member
    const team = await User.findById(teamId);
    if (!team || team.userType !== 'team') {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    // Check if user is a member of this team
    const isTeamMember = team.teamInfo?.members?.some(member => 
      (typeof member.user === 'string' ? member.user : member.user._id).toString() === userId.toString()
    );

    if (!isTeamMember) {
      return res.status(400).json({
        success: false,
        message: 'You are not a member of this team'
      });
    }

    // Check if team is registered for this tournament
    const isTeamRegistered = tournament.teams.includes(teamId);
    if (!isTeamRegistered) {
      return res.status(400).json({
        success: false,
        message: 'This team is not registered for this tournament'
      });
    }

    // Remove team from tournament
    tournament.teams = tournament.teams.filter(id => id.toString() !== teamId.toString());

    // Remove team from all members' joinedTeams
    if (team.teamInfo?.members) {
      for (const member of team.teamInfo.members) {
        const memberUserId = typeof member.user === 'string' ? member.user : member.user._id;
        const memberUser = await User.findById(memberUserId);
        if (memberUser) {
          memberUser.playerInfo.joinedTeams = memberUser.playerInfo.joinedTeams.filter(
            joinedTeamId => joinedTeamId.toString() !== teamId.toString()
          );
          await memberUser.save();
        }
      }
    }

    await tournament.save();

    res.status(200).json({
      success: true,
      message: 'Successfully left tournament as team'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to leave tournament as team',
      error: error.message
    });
  }
};

// Auto assign groups
const autoAssignGroups = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Check if user is the host
    if (tournament.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only tournament host can assign groups'
      });
    }

    // For duo tournaments, only consider teams (not individual participants)
    // For solo tournaments, consider both individual participants and teams
    let allParticipants;
    if (tournament.format === 'Duo') {
      allParticipants = [...tournament.teams];
    } else {
      allParticipants = [...tournament.participants, ...tournament.teams];
    }
    
    if (allParticipants.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No participants to assign to groups'
      });
    }

    // Get existing groups or create new ones
    let groups = tournament.groups || [];
    
    // If no groups exist, create them based on teamsPerGroup
    if (groups.length === 0) {
      const totalGroups = Math.ceil(tournament.totalSlots / tournament.teamsPerGroup);
      for (let i = 0; i < totalGroups; i++) {
        groups.push({
          name: `Group ${i + 1}`,
          participants: [],
          round: 1,
          groupLetter: String.fromCharCode(65 + i) // A, B, C, D...
        });
      }
    }
    
    // Clear existing participants from all groups
    groups.forEach(group => {
      group.participants = [];
    });
    
    // Assign participants to groups, filling one group completely before moving to the next
    let currentGroupIndex = 0;
    let currentGroupParticipants = 0;
    
    for (const participant of allParticipants) {
      // If current group is full, move to next group
      if (currentGroupParticipants >= tournament.teamsPerGroup) {
        currentGroupIndex++;
        currentGroupParticipants = 0;
      }
      
      // If we've filled all groups, start over (shouldn't happen with proper validation)
      if (currentGroupIndex >= groups.length) {
        currentGroupIndex = 0;
      }
      
      // Add participant ID to current group (consistent with assignParticipantToGroup)
      groups[currentGroupIndex].participants.push(participant._id || participant);
      currentGroupParticipants++;
    }

    tournament.groups = groups;
    
    // Automatically create broadcast channels for each group
    tournament.broadcastChannels = [];
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const channelName = `Round ${group.round || 1} - ${group.name}`;
      
      const broadcastChannel = {
        name: channelName,
        type: 'Text Messages',
        description: `Broadcast channel for ${group.name} in Round ${group.round || 1}`,
        groupId: group._id || `group_${i + 1}`,
        round: group.round || 1,
        channelId: null // This would be set when integrating with actual messaging system
      };

      tournament.broadcastChannels.push(broadcastChannel);
    }
    
    await tournament.save();

    // Send notifications to all participants about group assignment and broadcast channels
    // For duo tournaments, only notify teams (not individual participants)
    // For solo tournaments, notify both individual participants and teams
    let allTournamentParticipants;
    if (tournament.format === 'Duo') {
      allTournamentParticipants = [...tournament.teams];
    } else {
      allTournamentParticipants = [...tournament.participants, ...tournament.teams];
    }
    const notificationPromises = allTournamentParticipants.map(async (participantId) => {
      const notification = await Notification.createNotification({
        recipient: participantId,
        sender: req.user._id,
        type: 'tournament',
        title: `Groups Assigned: ${tournament.name}`,
        message: `You have been assigned to a group! Check your group details and broadcast channels.`,
        data: {
          tournamentId: tournament._id,
          customData: { action: 'groups_assigned' }
        }
      });
      
      // Emit real-time notification
      emitNotification(participantId, notification);
      return notification;
    });

    await Promise.all(notificationPromises);

    res.status(200).json({
      success: true,
      message: 'Groups assigned and broadcast channels created successfully',
      data: {
        groups: tournament.groups,
        broadcastChannels: tournament.broadcastChannels
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to assign groups',
      error: error.message
    });
  }
};

// Send tournament-wide message
const sendTournamentMessage = async (req, res) => {
  try {
    const { message, type = 'text' } = req.body;
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Check if user is the host
    if (tournament.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only tournament host can send messages'
      });
    }

    // Initialize tournamentMessages array if it doesn't exist
    if (!tournament.tournamentMessages) {
      tournament.tournamentMessages = [];
    }

    // Add message to tournament messages
    const newMessage = {
      sender: req.user._id,
      message,
      type,
      timestamp: new Date()
    };

    tournament.tournamentMessages.push(newMessage);
    await tournament.save();

    // Send notifications to all participants
    const allParticipants = [...tournament.participants, ...tournament.teams];
    
    const notificationPromises = allParticipants.map(async (participantId) => {
      const notification = await Notification.createNotification({
        recipient: participantId,
        sender: req.user._id,
        type: 'tournament',
        title: `Tournament Update: ${tournament.name}`,
        message: message,
        data: {
          tournamentId: tournament._id,
          customData: { action: 'tournament_message' }
        }
      });
      
      // Emit real-time notification
      emitNotification(participantId, notification);
      return notification;
    });

    await Promise.all(notificationPromises);

    res.status(200).json({
      success: true,
      message: 'Tournament message sent successfully',
      data: { message: newMessage }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to send tournament message',
      error: error.message
    });
  }
};

// Send group message
const sendGroupMessage = async (req, res) => {
  try {
    const { groupId, round, message, type = 'text' } = req.body;
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Check if user is the host
    if (tournament.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only tournament host can send group messages'
      });
    }

    // Initialize groupMessages array if it doesn't exist
    if (!tournament.groupMessages) {
      tournament.groupMessages = [];
    }

    // Find or create group message thread
    let groupMessageThread = tournament.groupMessages.find(
      gm => gm.groupId === groupId && gm.round === round
    );

    if (!groupMessageThread) {
      groupMessageThread = {
        groupId,
        round,
        messages: []
      };
      tournament.groupMessages.push(groupMessageThread);
    }

    // Add message to group thread
    const newMessage = {
      sender: req.user._id,
      message,
      type,
      timestamp: new Date()
    };

    groupMessageThread.messages.push(newMessage);
    await tournament.save();

    // Send notifications to group participants
    const group = tournament.groups.find(g => g._id === groupId || g.name === groupId);
    if (group && group.participants) {
      const notificationPromises = group.participants.map(async (participantId) => {
        const notification = await Notification.createNotification({
          recipient: participantId,
          sender: req.user._id,
          type: 'tournament',
          title: `Group Update: ${group.name}`,
          message: message,
          data: {
            tournamentId: tournament._id,
            groupId,
            customData: { action: 'group_message' }
          }
        });
        
        // Emit real-time notification
        emitNotification(participantId, notification);
        return notification;
      });

      await Promise.all(notificationPromises);
    }

    res.status(200).json({
      success: true,
      message: 'Group message sent successfully',
      data: { message: newMessage }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to send group message',
      error: error.message
    });
  }
};

// Get tournament messages
const getTournamentMessages = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id)
      .populate('tournamentMessages.sender', 'username profile');

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    res.status(200).json({
      success: true,
      data: { messages: tournament.tournamentMessages || [] }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get tournament messages',
      error: error.message
    });
  }
};

// Get group messages
const getGroupMessages = async (req, res) => {
  try {
    const { groupId, round } = req.query;
    const tournament = await Tournament.findById(req.params.id)
      .populate('groupMessages.messages.sender', 'username profile');

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    const groupMessageThread = tournament.groupMessages.find(
      gm => gm.groupId === groupId && gm.round === parseInt(round)
    );

    res.status(200).json({
      success: true,
      data: { messages: groupMessageThread?.messages || [] }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get group messages',
      error: error.message
    });
  }
};

// Delete tournament message
const deleteTournamentMessage = async (req, res) => {
  try {
    const { messageIndex } = req.params;
    const tournament = await Tournament.findById(req.params.id);
    
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Check if user is the host
    if (tournament.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the host can delete messages'
      });
    }

    if (!tournament.tournamentMessages || tournament.tournamentMessages.length <= messageIndex) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    tournament.tournamentMessages.splice(messageIndex, 1);
    await tournament.save();

    res.status(200).json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete message',
      error: error.message
    });
  }
};

// Delete group message
const deleteGroupMessage = async (req, res) => {
  try {
    const { groupId, round, messageIndex } = req.params;
    const tournament = await Tournament.findById(req.params.id);
    
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Check if user is the host
    if (tournament.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the host can delete messages'
      });
    }

    const groupThread = tournament.groupMessages.find(
      gm => gm.groupId === groupId && gm.round === parseInt(round)
    );

    if (!groupThread || !groupThread.messages || groupThread.messages.length <= messageIndex) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    groupThread.messages.splice(messageIndex, 1);
    await tournament.save();

    res.status(200).json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete message',
      error: error.message
    });
  }
};


// Start tournament
const startTournament = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Check if user is the host
    if (tournament.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only tournament host can start tournament'
      });
    }

    // Check if tournament can be started
    if (tournament.status !== 'Registration Open') {
      return res.status(400).json({
        success: false,
        message: 'Tournament cannot be started in current status'
      });
    }

    // Check if start date has arrived
    if (new Date() < tournament.startDate) {
      return res.status(400).json({
        success: false,
        message: 'Tournament start date has not arrived yet'
      });
    }

    tournament.status = 'Ongoing';
    tournament.currentRound = 1;
    await tournament.save();

    res.status(200).json({
      success: true,
      message: 'Tournament started successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to start tournament',
      error: error.message
    });
  }
};

// Delete tournament
const deleteTournament = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Check if user is the host
    if (tournament.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only tournament host can delete tournament'
      });
    }

    // Host can delete any tournament regardless of status
    // No status restrictions for deletion

    await Tournament.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Tournament deleted successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete tournament',
      error: error.message
    });
  }
};

const cancelTournament = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Check if user is the host
    if (tournament.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only tournament host can cancel tournament'
      });
    }

    // Only allow cancellation if tournament hasn't ended
    if (tournament.status === 'Completed' || tournament.status === 'Cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel tournament that has already ended or been cancelled'
      });
    }

    // Update tournament status to cancelled
    tournament.status = 'Cancelled';
    await tournament.save();

    res.status(200).json({
      success: true,
      message: 'Tournament cancelled successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to cancel tournament',
      error: error.message
    });
  }
};

// Schedule matches for tournament
const scheduleMatches = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Check if user is the host
    if (tournament.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only tournament host can schedule matches'
      });
    }

    // Check if tournament has groups assigned
    if (!tournament.groups || tournament.groups.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please assign groups before scheduling matches'
      });
    }

    // Clear existing matches
    tournament.matches = [];

    // Generate matches based on tournament format
    if (tournament.format === 'Solo' || tournament.format === 'Duo') {
      // Single elimination bracket
      const allParticipants = [...tournament.participants, ...tournament.teams];
      const totalRounds = Math.ceil(Math.log2(allParticipants.length));
      
      // Create first round matches
      for (let i = 0; i < allParticipants.length; i += 2) {
        if (i + 1 < allParticipants.length) {
          tournament.matches.push({
            round: 1,
            team1: allParticipants[i],
            team2: allParticipants[i + 1],
            status: 'Scheduled',
            scheduledTime: new Date(tournament.startDate),
            createdBy: req.user._id,
            lastModifiedBy: req.user._id
          });
        }
      }
      
      tournament.totalRounds = totalRounds;
    } else {
      // Group stage format
      tournament.groups.forEach((group, groupIndex) => {
        const participants = group.participants;
        
        // Create round-robin matches within each group
        for (let i = 0; i < participants.length; i++) {
          for (let j = i + 1; j < participants.length; j++) {
            tournament.matches.push({
              round: 1,
              groupId: group._id || group.name,
              groupName: group.name,
              team1: participants[i],
              team2: participants[j],
              status: 'Scheduled',
              scheduledTime: new Date(tournament.startDate),
              createdBy: req.user._id,
              lastModifiedBy: req.user._id
            });
          }
        }
      });
      
      tournament.totalRounds = 1; // Will be updated when knockout stage starts
    }

    await tournament.save();

    res.status(200).json({
      success: true,
      message: 'Matches scheduled successfully',
      data: {
        matches: tournament.matches,
        totalRounds: tournament.totalRounds
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to schedule matches',
      error: error.message
    });
  }
};

// Create detailed match schedule
const createMatchSchedule = async (req, res) => {
  try {
    const { round, groupId, matches } = req.body;
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Check if user is the host
    if (tournament.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only tournament host can create match schedules'
      });
    }

    // Validate matches data
    if (!matches || !Array.isArray(matches) || matches.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Matches data is required'
      });
    }

    // Find the group
    const group = tournament.groups.find(g => 
      (g._id && g._id.toString() === groupId) || g.name === groupId
    );

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Create matches with detailed scheduling
    const newMatches = matches.map(matchData => {
      const scheduledTime = new Date(matchData.scheduledTime);
      const scheduledDate = scheduledTime.toISOString().split('T')[0];
      const scheduledTimeString = scheduledTime.toTimeString().split(' ')[0].substring(0, 5);

      return {
        round: round || 1,
        groupId: groupId,
        groupName: group.name,
        team1: matchData.team1 || null, // Optional for group matches
        team2: matchData.team2 || null, // Optional for group matches
        status: 'Scheduled',
        scheduledTime: scheduledTime,
        scheduledDate: scheduledDate,
        scheduledTimeString: scheduledTimeString,
        matchDuration: matchData.matchDuration || tournament.scheduleConfig?.defaultMatchDuration || 30,
        venue: matchData.venue || 'Online',
        description: matchData.description || '',
        createdBy: req.user._id,
        lastModifiedBy: req.user._id
      };
    });

    // Add new matches to tournament
    tournament.matches.push(...newMatches);
    await tournament.save();

    res.status(201).json({
      success: true,
      message: 'Match schedule created successfully',
      data: {
        matches: newMatches,
        group: group.name,
        round: round || 1
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create match schedule',
      error: error.message
    });
  }
};

// Update match schedule
const updateMatchSchedule = async (req, res) => {
  try {
    const { matchId } = req.params;
    const { scheduledTime, venue, description, matchDuration } = req.body;
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Check if user is the host
    if (tournament.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only tournament host can update match schedules'
      });
    }

    const match = tournament.matches.id(matchId);
    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    // Store original time if rescheduling
    if (scheduledTime && new Date(scheduledTime).getTime() !== match.scheduledTime.getTime()) {
      match.originalScheduledTime = match.scheduledTime;
      match.isRescheduled = true;
    }

    // Update match details
    if (scheduledTime) {
      const newScheduledTime = new Date(scheduledTime);
      match.scheduledTime = newScheduledTime;
      match.scheduledDate = newScheduledTime.toISOString().split('T')[0];
      match.scheduledTimeString = newScheduledTime.toTimeString().split(' ')[0].substring(0, 5);
    }

    if (venue !== undefined) match.venue = venue;
    if (description !== undefined) match.description = description;
    if (matchDuration !== undefined) match.matchDuration = matchDuration;
    
    match.lastModifiedBy = req.user._id;

    await tournament.save();

    res.status(200).json({
      success: true,
      message: 'Match schedule updated successfully',
      data: {
        match: match
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update match schedule',
      error: error.message
    });
  }
};

// Get tournament schedule
const getTournamentSchedule = async (req, res) => {
  try {
    const { round, groupId, date } = req.query;
    const tournament = await Tournament.findById(req.params.id)
      .populate('matches.team1', 'username profile.displayName profile.avatar')
      .populate('matches.team2', 'username profile.displayName profile.avatar')
      .populate('matches.winner', 'username profile.displayName profile.avatar')
      .populate('matches.createdBy', 'username profile.displayName')
      .populate('matches.lastModifiedBy', 'username profile.displayName');

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    let filteredMatches = tournament.matches;

    // Filter by round
    if (round) {
      filteredMatches = filteredMatches.filter(match => match.round === parseInt(round));
    }

    // Filter by group
    if (groupId) {
      filteredMatches = filteredMatches.filter(match => 
        match.groupId === groupId || match.groupName === groupId
      );
    }

    // Filter by date
    if (date) {
      filteredMatches = filteredMatches.filter(match => match.scheduledDate === date);
    }

    // Group matches by date and time
    const scheduleByDate = filteredMatches.reduce((acc, match) => {
      const date = match.scheduledDate;
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(match);
      return acc;
    }, {});

    // Sort matches within each date by time
    Object.keys(scheduleByDate).forEach(date => {
      scheduleByDate[date].sort((a, b) => 
        new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime()
      );
    });

    res.status(200).json({
      success: true,
      data: {
        schedule: scheduleByDate,
        totalMatches: filteredMatches.length,
        scheduleConfig: tournament.scheduleConfig
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get tournament schedule',
      error: error.message
    });
  }
};

// Configure schedule settings
const configureScheduleSettings = async (req, res) => {
  try {
    const { timeSlots, availableDates, defaultMatchDuration, timezone } = req.body;
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Check if user is the host
    if (tournament.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only tournament host can configure schedule settings'
      });
    }

    // Initialize scheduleConfig if it doesn't exist
    if (!tournament.scheduleConfig) {
      tournament.scheduleConfig = {};
    }

    // Update schedule configuration
    if (timeSlots) tournament.scheduleConfig.timeSlots = timeSlots;
    if (availableDates) tournament.scheduleConfig.availableDates = availableDates;
    if (defaultMatchDuration) tournament.scheduleConfig.defaultMatchDuration = defaultMatchDuration;
    if (timezone) tournament.scheduleConfig.timezone = timezone;

    await tournament.save();

    res.status(200).json({
      success: true,
      message: 'Schedule settings configured successfully',
      data: {
        scheduleConfig: tournament.scheduleConfig
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to configure schedule settings',
      error: error.message
    });
  }
};

// Delete match from schedule
const deleteMatchFromSchedule = async (req, res) => {
  try {
    const { matchId } = req.params;
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Check if user is the host
    if (tournament.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only tournament host can delete matches'
      });
    }

    const match = tournament.matches.id(matchId);
    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    // Remove match
    tournament.matches.pull(matchId);
    await tournament.save();

    res.status(200).json({
      success: true,
      message: 'Match deleted successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete match',
      error: error.message
    });
  }
};

// Delete all matches for a specific round
const deleteRoundSchedule = async (req, res) => {
  try {
    const { round } = req.params;
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Check if user is the host
    if (tournament.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the tournament host can delete round schedule'
      });
    }

    // Remove all matches for the specified round
    const initialCount = tournament.matches.length;
    tournament.matches = tournament.matches.filter(match => match.round !== parseInt(round));
    const deletedCount = initialCount - tournament.matches.length;
    
    await tournament.save();

    res.status(200).json({
      success: true,
      message: `Deleted ${deletedCount} matches from Round ${round}`,
      deletedCount: deletedCount
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete round schedule',
      error: error.message
    });
  }
};

// Update match result
const updateMatchResult = async (req, res) => {
  try {
    const { matchId, team1Score, team2Score } = req.body;
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Check if user is the host
    if (tournament.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only tournament host can update match results'
      });
    }

    const match = tournament.matches.id(matchId);
    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    // Update match result
    match.result = {
      team1Score: parseInt(team1Score),
      team2Score: parseInt(team2Score)
    };
    
    // Determine winner
    if (team1Score > team2Score) {
      match.winner = match.team1;
    } else if (team2Score > team1Score) {
      match.winner = match.team2;
    }
    
    match.status = 'Completed';
    await tournament.save();

    res.status(200).json({
      success: true,
      message: 'Match result updated successfully',
      data: {
        match: match
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update match result',
      error: error.message
    });
  }
};

// Start match
const startMatch = async (req, res) => {
  try {
    const { matchId } = req.body;
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Check if user is the host
    if (tournament.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only tournament host can start matches'
      });
    }

    const match = tournament.matches.id(matchId);
    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    match.status = 'In Progress';
    await tournament.save();

    res.status(200).json({
      success: true,
      message: 'Match started successfully',
      data: {
        match: match
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to start match',
      error: error.message
    });
  }
};

// Get tournament participants with groups
const getTournamentParticipants = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id)
      .populate('participants', 'username profile.displayName profile.avatar')
      .populate('teams', 'username profile.displayName profile.avatar')
      .populate('groups.participants', 'username profile.displayName profile.avatar');

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        participants: tournament.participants,
        teams: tournament.teams,
        groups: tournament.groups,
        totalParticipants: tournament.participants.length + tournament.teams.length
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tournament participants',
      error: error.message
    });
  }
};

// Remove participant from tournament
const removeParticipant = async (req, res) => {
  try {
    const { participantId } = req.body;
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Check if user is the host
    if (tournament.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only tournament host can remove participants'
      });
    }

    // Remove from participants array
    tournament.participants = tournament.participants.filter(
      id => id.toString() !== participantId
    );
    
    // Remove from teams array
    tournament.teams = tournament.teams.filter(
      id => id.toString() !== participantId
    );

    // Remove from groups
    tournament.groups.forEach(group => {
      group.participants = group.participants.filter(
        id => id.toString() !== participantId
      );
    });

    await tournament.save();

    res.status(200).json({
      success: true,
      message: 'Participant removed successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to remove participant',
      error: error.message
    });
  }
};

const assignParticipantToGroup = async (req, res) => {
  try {
    const { participantId, groupId, round } = req.body;
    const tournament = await Tournament.findById(req.params.id);
    
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    let group;
    
    if (!groupId) {
      // Auto-assign: Find the first group that's not full
      group = tournament.groups.find(g => 
        g.round === (round || 1) && 
        (!g.participants || g.participants.length < tournament.teamsPerGroup)
      );
      
      if (!group) {
        return res.status(400).json({
          success: false,
          message: 'No available groups. All groups are full!'
        });
      }
    } else {
      // Manual assign: Find the specific group
      group = tournament.groups.find(g => 
        (g._id && g._id.toString() === groupId) || g.name === groupId
      );
      
      if (!group) {
        return res.status(404).json({
          success: false,
          message: 'Group not found'
        });
      }
    }

    // Check if participant is already in this group
    const alreadyInGroup = group.participants.some(p => p.toString() === participantId);
    if (alreadyInGroup) {
      return res.status(400).json({
        success: false,
        message: 'Participant already in this group'
      });
    }

    // Remove participant from any other group first
    tournament.groups.forEach(g => {
      g.participants = g.participants.filter(p => p.toString() !== participantId);
    });

    // Add participant to the selected group
    group.participants.push(participantId);
    
    await tournament.save();
    
    res.status(200).json({
      success: true,
      message: 'Participant assigned to group successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to assign participant to group',
      error: error.message
    });
  }
};

const updateRoundSettings = async (req, res) => {
  try {
    const { round, roundName, teamsPerGroup, totalSlots, numberOfGroups } = req.body;
    const tournament = await Tournament.findById(req.params.id);
    
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Check if user is the host
    if (tournament.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only tournament host can update round settings'
      });
    }

    // Update tournament settings for Round 1
    if (round === 1) {
      tournament.teamsPerGroup = teamsPerGroup;
      tournament.totalSlots = totalSlots;
      tournament.numberOfGroups = numberOfGroups;
    }

    await tournament.save();

    res.status(200).json({
      success: true,
      message: 'Round settings updated successfully',
      tournament
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update round settings',
      error: error.message
    });
  }
};

const recreateGroups = async (req, res) => {
  try {
    const { teamsPerGroup, totalSlots } = req.body;
    const tournament = await Tournament.findById(req.params.id);
    
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Check if user is the host
    if (tournament.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only tournament host can recreate groups'
      });
    }

    // Calculate number of groups
    const numberOfGroups = Math.ceil(totalSlots / teamsPerGroup);
    
    // Clear existing groups for Round 1
    tournament.groups = tournament.groups.filter(group => group.round !== 1);
    
    // Create new groups for Round 1
    const newGroups = [];
    for (let i = 0; i < numberOfGroups; i++) {
      newGroups.push({
        name: `Group ${i + 1}`,
        participants: [],
        round: 1,
        groupLetter: String.fromCharCode(65 + i) // A, B, C, D...
      });
    }
    
    tournament.groups = [...tournament.groups, ...newGroups];
    
    // Recreate broadcast channels for Round 1
    tournament.broadcastChannels = tournament.broadcastChannels.filter(channel => channel.round !== 1);
    
    for (let i = 0; i < numberOfGroups; i++) {
      const group = newGroups[i];
      const channelName = `Round 1 - ${group.name}`;
      
      const broadcastChannel = {
        name: channelName,
        type: 'Text Messages',
        description: `Broadcast channel for ${group.name} in Round 1`,
        groupId: group._id || `group_${i + 1}`,
        round: 1,
        channelId: null
      };

      tournament.broadcastChannels.push(broadcastChannel);
    }
    
    await tournament.save();

    res.status(200).json({
      success: true,
      message: 'Groups recreated successfully',
      tournament
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to recreate groups',
      error: error.message
    });
  }
};

// Submit group results
const submitGroupResults = async (req, res) => {
  try {
    const { round, groupId, groupName, teams } = req.body;
    console.log('SubmitGroupResults - Received data:', { round, groupId, groupName, teams: teams?.length });
    
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      console.log('Tournament not found:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Check if user is the host
    if (tournament.host.toString() !== req.user._id.toString()) {
      console.log('User not authorized:', req.user._id, 'vs', tournament.host);
      return res.status(403).json({
        success: false,
        message: 'Only tournament host can submit results'
      });
    }

    // Validate teams data
    if (!teams || !Array.isArray(teams) || teams.length === 0) {
      console.log('Invalid teams data:', teams);
      return res.status(400).json({
        success: false,
        message: 'Teams data is required'
      });
    }

    // Calculate total points and rank teams
    const teamsWithPoints = teams.map(team => ({
      ...team,
      totalPoints: (team.finishPoints || 0) + (team.positionPoints || 0),
      qualified: team.qualified || false // Preserve qualified status
    }));

    // Sort by total points (descending) and assign ranks
    teamsWithPoints.sort((a, b) => b.totalPoints - a.totalPoints);
    teamsWithPoints.forEach((team, index) => {
      team.rank = index + 1;
    });

    // Log qualification status
    console.log('Teams with qualification status:', teamsWithPoints.map(t => ({
      teamName: t.teamName,
      qualified: t.qualified,
      totalPoints: t.totalPoints,
      rank: t.rank
    })));

    // Find existing group results or create new
    let groupResults = tournament.groupResults.find(
      gr => gr.round === round && gr.groupId === groupId
    );

    if (groupResults) {
      // Update existing results
      console.log('Updating existing group results');
      groupResults.teams = teamsWithPoints;
      groupResults.submittedAt = new Date();
    } else {
      // Create new group results
      console.log('Creating new group results');
      tournament.groupResults.push({
        round,
        groupId,
        groupName,
        teams: teamsWithPoints,
        submittedAt: new Date()
      });
    }

    console.log('Saving tournament with groupResults length:', tournament.groupResults.length);
    await tournament.save();
    console.log('Tournament saved successfully');

    // Send notifications to group participants about results
    const group = tournament.groups.find(g => g._id === groupId || g.name === groupId);
    if (group && group.participants && group.participants.length > 0) {
      const notificationPromises = group.participants.map(async (participantId) => {
        const notification = await Notification.createNotification({
          recipient: participantId,
          sender: req.user._id,
          type: 'tournament',
          title: `Results Update: ${tournament.name}`,
          message: `Round ${round} results have been published for ${groupName}`,
          data: {
            tournamentId: tournament._id,
            groupId: groupId,
            round: round,
            customData: { action: 'results_update' }
          }
        });
        
        // Emit real-time notification
        emitNotification(participantId, notification);
        return notification;
      });

      await Promise.all(notificationPromises);
    }

    res.status(200).json({
      success: true,
      message: 'Group results submitted successfully',
      data: {
        groupResults: groupResults || tournament.groupResults[tournament.groupResults.length - 1]
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to submit group results',
      error: error.message
    });
  }
};

// Get round results
const getRoundResults = async (req, res) => {
  try {
    const { round } = req.params;
    console.log('GetRoundResults - Fetching for round:', round, 'tournament:', req.params.id);
    
    const tournament = await Tournament.findById(req.params.id)
      .populate('groupResults.teams.teamId', 'username profile.displayName profile.avatar');

    if (!tournament) {
      console.log('Tournament not found for getRoundResults');
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    const roundResults = tournament.groupResults.filter(gr => gr.round === parseInt(round));

    // Calculate overall standings
    const allTeams = [];
    roundResults.forEach(groupResult => {
      groupResult.teams.forEach(team => {
        allTeams.push({
          ...team,
          groupName: groupResult.groupName,
          groupId: groupResult.groupId
        });
      });
    });

    // Sort by total points for overall standings
    allTeams.sort((a, b) => b.totalPoints - a.totalPoints);
    allTeams.forEach((team, index) => {
      team.overallRank = index + 1;
    });

    res.status(200).json({
      success: true,
      data: {
        roundResults,
        overallStandings: allTeams,
        round: parseInt(round)
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get round results',
      error: error.message
    });
  }
};

// Broadcast schedule to all groups
const broadcastSchedule = async (req, res) => {
  try {
    const { round } = req.body;
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    if (tournament.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only tournament host can broadcast schedule'
      });
    }

    const roundMatches = tournament.matches.filter(match => match.round === parseInt(round));
    
    if (roundMatches.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No schedule found for this round'
      });
    }

    const roundGroups = tournament.groups.filter(group => group.round === parseInt(round));
    let broadcastCount = 0;

    // Initialize groupMessages if it doesn't exist
    if (!tournament.groupMessages) {
      tournament.groupMessages = [];
    }

    for (const group of roundGroups) {
      const groupMatches = roundMatches.filter(match => 
        match.groupName === group.name || match.groupName === group.groupLetter
      );
      
      if (groupMatches.length > 0) {
        let scheduleMessage = `Your group will play ${groupMatches.length} matches in Round ${round}\n\n`;
        
        groupMatches.forEach((match, index) => {
          const matchDate = match.scheduledDate ? new Date(match.scheduledDate).toLocaleDateString() : 'TBD';
          const matchTime = match.scheduledTimeString || 'TBD';
          scheduleMessage += `Match ${index + 1}\n`;
          scheduleMessage += `Date - ${matchDate}\n`;
          scheduleMessage += `Time - ${matchTime}\n\n`;
        });

        const groupId = group._id || group.name;
        
        let groupMessageThread = tournament.groupMessages.find(
          gm => gm.groupId === groupId && gm.round === parseInt(round)
        );

        if (!groupMessageThread) {
          groupMessageThread = {
            groupId: groupId,
            round: parseInt(round),
            messages: []
          };
          tournament.groupMessages.push(groupMessageThread);
        }

        groupMessageThread.messages.push({
          sender: req.user._id,
          message: scheduleMessage,
          timestamp: new Date(),
          type: 'announcement'
        });

        // Send notifications to group participants
        if (group.participants && group.participants.length > 0) {
          const notificationPromises = group.participants.map(async (participantId) => {
        const notification = await Notification.createNotification({
          recipient: participantId,
          sender: req.user._id,
          type: 'tournament',
          title: `Schedule Update: ${tournament.name}`,
          message: `Round ${round} schedule has been updated for your group`,
          data: {
            tournamentId: tournament._id,
            groupId: groupId,
            round: parseInt(round),
            customData: { action: 'schedule_update' }
          }
        });
            
            // Emit real-time notification
            emitNotification(participantId, notification);
            return notification;
          });

          await Promise.all(notificationPromises);
        }

        broadcastCount++;
      }
    }

    await tournament.save();

    res.status(200).json({
      success: true,
      message: `Schedule broadcasted to ${broadcastCount} groups`,
      data: {
        round: parseInt(round),
        groupsBroadcasted: broadcastCount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Qualify teams for next round
const qualifyTeams = async (req, res) => {
  try {
    const { round, qualifiedTeams, qualificationCriteria } = req.body;
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Check if user is the host
    if (tournament.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only tournament host can qualify teams'
      });
    }

    // Validate qualified teams
    if (!qualifiedTeams || !Array.isArray(qualifiedTeams) || qualifiedTeams.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Qualified teams data is required'
      });
    }

    // Find existing qualification or create new
    let qualification = tournament.qualifications.find(q => q.round === round);

    if (qualification) {
      // Update existing qualification
      qualification.qualifiedTeams = qualifiedTeams;
      qualification.qualificationCriteria = qualificationCriteria || 8;
      qualification.totalQualified = qualifiedTeams.length;
      qualification.qualifiedAt = new Date();
    } else {
      // Create new qualification
      tournament.qualifications.push({
        round,
        qualifiedTeams,
        qualificationCriteria: qualificationCriteria || 8,
        totalQualified: qualifiedTeams.length,
        qualifiedAt: new Date()
      });
    }

    // Update groupResults to mark teams as qualified
    console.log('Qualifying teams:', qualifiedTeams);
    
    let teamsUpdated = 0;
    tournament.groupResults.forEach(groupResult => {
      if (groupResult.round === parseInt(round)) {
        console.log(`Processing group ${groupResult.groupName} for round ${round}`);
        groupResult.teams.forEach(team => {
          const wasQualified = team.qualified;
          const teamIdStr = team.teamId.toString();
          
          // Convert qualified teams to strings for comparison
          const qualifiedTeamsStr = qualifiedTeams.map(id => id.toString());
          const isQualified = qualifiedTeamsStr.includes(teamIdStr);
          
          team.qualified = isQualified;
          
          if (team.qualified !== wasQualified) {
            teamsUpdated++;
            console.log(`Team ${team.teamName} qualified: ${team.qualified}`);
          }
        });
      }
    });
    
    console.log(`Total teams updated: ${teamsUpdated}`);

    await tournament.save();

    res.status(200).json({
      success: true,
      message: 'Teams qualified successfully',
      data: {
        qualification: qualification || tournament.qualifications[tournament.qualifications.length - 1]
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to qualify teams',
      error: error.message
    });
  }
};

// Create next round groups
const createNextRoundGroups = async (req, res) => {
  try {
    const { currentRound, nextRound, teamsPerGroup } = req.body;
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Check if user is the host
    if (tournament.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only tournament host can create next round groups'
      });
    }

    // Get qualified teams from current round
    const qualification = tournament.qualifications.find(q => q.round === currentRound);
    if (!qualification) {
      return res.status(400).json({
        success: false,
        message: 'No qualified teams found for current round'
      });
    }

    const qualifiedTeams = qualification.qualifiedTeams;
    const totalGroups = Math.ceil(qualifiedTeams.length / teamsPerGroup);

    // Create groups for next round
    const newGroups = [];
    for (let i = 0; i < totalGroups; i++) {
      newGroups.push({
        name: `Group ${String.fromCharCode(65 + i)}`,
        round: nextRound,
        groupLetter: String.fromCharCode(65 + i),
        participants: [],
        broadcastChannelId: null
      });
    }

    // Distribute qualified teams to groups
    let currentGroupIndex = 0;
    qualifiedTeams.forEach((teamId, index) => {
      if (currentGroupIndex >= totalGroups) {
        currentGroupIndex = 0;
      }
      newGroups[currentGroupIndex].participants.push(teamId);
      currentGroupIndex++;
    });

    // Add new groups to tournament
    tournament.groups.push(...newGroups);

    // Create broadcast channels for new groups
    newGroups.forEach((group, index) => {
      const channelName = `Round ${nextRound} - ${group.name}`;
      const broadcastChannel = {
        name: channelName,
        type: 'Text Messages',
        description: `Broadcast channel for ${group.name} in Round ${nextRound}`,
        groupId: group._id || `group_${index + 1}`,
        round: nextRound,
        channelId: null
      };
      tournament.broadcastChannels.push(broadcastChannel);
    });

    // Update tournament current round
    tournament.currentRound = nextRound;
    await tournament.save();

    // Send notifications to all qualified participants about new round and broadcast channels
    const allQualifiedParticipants = qualifiedTeams;
    const notificationPromises = allQualifiedParticipants.map(async (participantId) => {
      const notification = await Notification.createNotification({
        recipient: participantId,
        sender: req.user._id,
        type: 'tournament',
        title: `New Round Started: ${tournament.name}`,
        message: `Round ${nextRound} has started! Check your new group and broadcast channels.`,
        data: {
          tournamentId: tournament._id,
          round: nextRound,
          customData: { action: 'new_round_started' }
        }
      });
      
      // Emit real-time notification
      emitNotification(participantId, notification);
      return notification;
    });

    await Promise.all(notificationPromises);

    res.status(200).json({
      success: true,
      message: 'Next round groups created successfully',
      data: {
        groups: newGroups,
        totalGroups,
        qualifiedTeams: qualifiedTeams.length
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create next round groups',
      error: error.message
    });
  }
};

// Get qualification status
const getQualificationStatus = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id)
      .populate('qualifications.qualifiedTeams', 'username profile.displayName profile.avatar');

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        qualifications: tournament.qualifications,
        currentRound: tournament.currentRound,
        totalRounds: tournament.totalRounds
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get qualification status',
      error: error.message
    });
  }
};

// Save qualification settings
const saveQualificationSettings = async (req, res) => {
  try {
    const { round, teamsPerGroup, nextRoundTeamsPerGroup } = req.body;
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Check if user is the host
    if (tournament.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only tournament host can save qualification settings'
      });
    }

    // Find existing round settings or create new
    let roundSetting = tournament.roundSettings.find(rs => rs.round === round);

    if (roundSetting) {
      // Update existing settings
      roundSetting.teamsPerGroup = teamsPerGroup;
      roundSetting.qualificationCriteria = teamsPerGroup;
    } else {
      // Create new round settings
      tournament.roundSettings.push({
        round,
        teamsPerGroup,
        qualificationCriteria: teamsPerGroup,
        totalGroups: tournament.groups.filter(g => g.round === round).length,
        totalTeams: tournament.groups.filter(g => g.round === round).reduce((sum, g) => sum + g.participants.length, 0)
      });
    }

    // Store next round settings in tournament metadata
    tournament.qualificationSettings = {
      teamsPerGroup,
      nextRoundTeamsPerGroup
    };

    await tournament.save();

    res.status(200).json({
      success: true,
      message: 'Qualification settings saved successfully',
      data: {
        roundSettings: tournament.roundSettings,
        qualificationSettings: tournament.qualificationSettings
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to save qualification settings',
      error: error.message
    });
  }
};

// Get qualification settings
const getQualificationSettings = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        roundSettings: tournament.roundSettings,
        qualificationSettings: tournament.qualificationSettings || {
          teamsPerGroup: 8,
          nextRoundTeamsPerGroup: 16
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get qualification settings',
      error: error.message
    });
  }
};

// Create Round 2 with qualified teams
const createRound2 = async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const { groups, round } = req.body;

    const tournament = await Tournament.findById(tournamentId);
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    // Clear existing groups for this round before creating new ones
    tournament.groups = tournament.groups.filter(group => group.round !== round);
    
    // Clear existing group results for this round
    if (tournament.groupResults) {
      tournament.groupResults = tournament.groupResults.filter(result => result.round !== round);
    }

    // Add new groups to the tournament
    const newGroups = groups.map(group => ({
      name: group.name,
      round: round,
      participants: group.participants
    }));

    tournament.groups.push(...newGroups);
    tournament.currentRound = round;

    await tournament.save();

    res.json({
      success: true,
      message: `Round ${round} created successfully with ${groups.length} groups`,
      data: {
        groups: newGroups,
        totalGroups: groups.length,
        round: round
      }
    });

  } catch (error) {
    console.error('Error creating Round 2:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create Round 2',
      error: error.message
    });
  }
};

// Auto assign Round 2 with full functionality (groups, broadcast, results)
const autoAssignRound2 = async (req, res) => {
  try {
    const { id } = req.params;
    const { groups, round, qualifiedTeams } = req.body;

    console.log('Auto assign Round 2 - Request received:', {
      tournamentId: id,
      groupsCount: groups?.length,
      round,
      qualifiedTeamsCount: qualifiedTeams?.length
    });

    // Validate tournament ID
    if (!id) {
      console.error('Auto assign Round 2 - Tournament ID missing');
      return res.status(400).json({
        success: false,
        message: 'Tournament ID is required'
      });
    }

    // Validate input
    if (!groups || !Array.isArray(groups) || groups.length === 0) {
      console.error('Auto assign Round 2 - Groups data invalid:', groups);
      return res.status(400).json({
        success: false,
        message: 'Groups data is required and must be an array'
      });
    }

    if (!qualifiedTeams || !Array.isArray(qualifiedTeams)) {
      console.error('Auto assign Round 2 - Qualified teams data invalid:', qualifiedTeams);
      return res.status(400).json({
        success: false,
        message: 'Qualified teams data is required'
      });
    }

    console.log('Auto assign Round 2 - Looking for tournament with ID:', id);
    const tournament = await Tournament.findById(id);
    if (!tournament) {
      console.error('Auto assign Round 2 - Tournament not found for ID:', id);
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    console.log('Auto assign Round 2 - Tournament found:', tournament.name);

    // Clear existing Round 2 groups before creating new ones
    tournament.groups = tournament.groups.filter(group => group.round !== round);
    
    // Clear existing Round 2 group results
    if (tournament.groupResults) {
      tournament.groupResults = tournament.groupResults.filter(result => result.round !== round);
    }

    // Add new groups to the tournament
    const newGroups = groups.map(group => ({
      name: group.name,
      round: round,
      participants: group.participants.map(participant => participant.teamId) // Extract teamId only
    }));

    tournament.groups.push(...newGroups);
    tournament.currentRound = round;

    // Create broadcast message for Round 2
    console.log('Auto assign Round 2 - Creating broadcast message');
    const broadcastMessage = {
      type: 'round_start',
      title: `Round ${round} Started!`,
      message: `Round ${round} has begun with ${groups.length} groups. ${qualifiedTeams.length} qualified teams are competing!`,
      timestamp: new Date(),
      round: round
    };

    // Add broadcast to tournament
    if (!tournament.broadcasts) {
      tournament.broadcasts = [];
    }
    tournament.broadcasts.push(broadcastMessage);

    // Initialize group results for Round 2
    console.log('Auto assign Round 2 - Creating group results');
    const groupResults = groups.map(group => ({
      groupId: group.name,
      groupName: group.name,
      round: round,
      teams: group.participants.map(participant => ({
        teamId: participant.teamId,
        teamName: participant.teamName,
        wins: 0,
        finishPoints: 0,
        positionPoints: 0,
        totalPoints: 0,
        rank: 0,
        qualified: false
      }))
    }));

    // Add group results to tournament
    if (!tournament.groupResults) {
      tournament.groupResults = [];
    }
    tournament.groupResults.push(...groupResults);

    console.log('Auto assign Round 2 - Saving tournament');
    await tournament.save();
    console.log('Auto assign Round 2 - Tournament saved successfully');

    res.json({
      success: true,
      message: `Round ${round} created successfully with full functionality!`,
      data: {
        groups: newGroups,
        totalGroups: groups.length,
        round: round,
        qualifiedTeams: qualifiedTeams.length,
        broadcast: broadcastMessage,
        groupResults: groupResults
      }
    });

  } catch (error) {
    console.error('Auto assign Round 2 - Error:', error);
    console.error('Auto assign Round 2 - Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to auto assign Round 2',
      error: error.message
    });
  }
};

module.exports = {
  createTournament,
  getTournaments,
  getTournament,
  getTournamentByName,
  updateTournament,
  joinTournament,
  leaveTournament,
  leaveTournamentAsTeam,
  autoAssignGroups,
  sendTournamentMessage,
  sendGroupMessage,
  getTournamentMessages,
  getGroupMessages,
  deleteTournamentMessage,
  deleteGroupMessage,
  startTournament,
  deleteTournament,
  cancelTournament,
  scheduleMatches,
  createMatchSchedule,
  updateMatchSchedule,
  getTournamentSchedule,
  configureScheduleSettings,
  deleteMatchFromSchedule,
  deleteRoundSchedule,
  updateMatchResult,
  startMatch,
  getTournamentParticipants,
  removeParticipant,
  assignParticipantToGroup,
  updateRoundSettings,
  recreateGroups,
  submitGroupResults,
  getRoundResults,
  broadcastSchedule,
  qualifyTeams,
  createNextRoundGroups,
  getQualificationStatus,
  saveQualificationSettings,
  getQualificationSettings,
  createRound2,
  autoAssignRound2
};
