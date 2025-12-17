const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [20, 'Username cannot exceed 20 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  userType: {
    type: String,
    enum: ['player', 'team', 'admin'],
    required: [true, 'User type is required']
  },
  isSuperUser: {
    type: Boolean,
    default: false
  },
  profile: {
    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true
    },
    avatar: {
      type: String,
      default: ''
    },
    banner: {
      type: String,
      default: ''
    },
    bio: {
      type: String,
      maxlength: [500, 'Bio cannot exceed 500 characters'],
      default: ''
    },
    location: {
      type: String,
      default: ''
    },
    website: {
      type: String,
      default: ''
    },
    gamingPreferences: [{
      type: String,
      trim: true
    }],
    socialLinks: {
      discord: {
        type: String,
        default: ''
      },
      steam: {
        type: String,
        default: ''
      },
      twitch: {
        type: String,
        default: ''
      }
    }
  },
  // Player specific fields
  playerInfo: {
    games: [{
      name: String,
      rank: String,
      experience: String
    }],
    achievements: [{
      title: String,
      description: String,
      date: Date
    }],
    gamingStats: [{
      game: {
        type: String,
        required: true
      },
      // BGMI fields
      characterId: String,
      inGameName: String,
      idLevel: Number,
      role: String,
      fdRatio: Number,
      currentTier: String,
      // Clash of Clans fields
      playerTag: String,
      townhallLevel: String,
      // Clash Royale fields
      arena: String,
      // Chess.com fields
      username: String,
      rating: Number,
      title: String,
      puzzleRating: Number,
      // Fortnite fields
      epicUsername: String,
      level: Number,
      wins: Number,
      kd: Number,
      playstyle: String,
      // Valorant fields
      tag: String,
      rank: String,
      rr: Number,
      peakRank: String,
      // Call of Duty Mobile fields
      uid: String,
      // Free Fire Max fields
      // PUBG Mobile fields
      // Rocket League fields
      platform: String,
      mmr: Number,
      // Common fields
    }],
    lookingForTeam: {
      type: Boolean,
      default: false
    },
    preferredRoles: [String],
    skillLevel: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced', 'professional'],
      default: 'beginner'
    },
    // Team membership info for players
    joinedTeams: [{
      team: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      game: String,
      role: String,
      inGameName: String,
      joinedAt: {
        type: Date,
        default: Date.now
      },
      leftAt: {
        type: Date,
        default: null
      },
      isActive: {
        type: Boolean,
        default: true
      }
    }]
  },
  // Team specific fields
  teamInfo: {
    teamSize: {
      type: Number,
      default: 0
    },
    recruitingFor: [String],
    requirements: {
      type: String,
      default: ''
    },
    teamType: {
      type: String,
      enum: ['casual', 'competitive', 'professional'],
      default: 'casual'
    },
    members: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      role: String,
      joinedAt: {
        type: Date,
        default: Date.now
      }
    }],
    // Game-specific rosters
    rosters: [{
      game: {
        type: String,
        enum: ['BGMI', 'Valorant', 'Free Fire', 'Call of Duty Mobile'],
        required: true
      },
      players: [{
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        role: {
          type: String,
          enum: ['Captain', 'Player', 'Substitute', 'Coach', 'Manager'],
          default: 'Player'
        },
        inGameName: String,
        joinedAt: {
          type: Date,
          default: Date.now
        },
        leftAt: {
          type: Date,
          default: null
        },
        isActive: {
          type: Boolean,
          default: true
        }
      }],
      isActive: {
        type: Boolean,
        default: true
      }
    }],
    // Team staff
    staff: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      role: {
        type: String,
        enum: ['Owner', 'Manager', 'Coach', 'Analyst', 'Content Creator'],
        required: true
      },
      joinedAt: {
        type: Date,
        default: Date.now
      },
      leftAt: {
        type: Date,
        default: null
      },
      isActive: {
        type: Boolean,
        default: true
      },
      leaveRequestStatus: {
        type: String,
        enum: ['none', 'pending', 'approved', 'rejected'],
        default: 'none'
      }
    }]
  },
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  posts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post'
  }],
  isVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastSeen: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for better search performance
userSchema.index({ username: 1, email: 1 });
userSchema.index({ 'profile.displayName': 1 });
userSchema.index({ userType: 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Ensure playerInfo.joinedTeams exists for players
userSchema.pre('save', function(next) {
  if (this.userType === 'player') {
    if (!this.playerInfo) {
      this.playerInfo = {};
    }
    if (!this.playerInfo.joinedTeams) {
      this.playerInfo.joinedTeams = [];
    }
  }
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    if (!candidatePassword || !this.password) {
      return false;
    }
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    console.error('Password comparison error:', error);
    return false;
  }
};

// Get public profile
userSchema.methods.getPublicProfile = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.email;
  return userObject;
};

// Populate team information
userSchema.methods.populateTeamInfo = async function() {
  if (this.userType === 'team') {
    await this.populate([
      {
        path: 'teamInfo.members.user',
        select: 'username profile.displayName profile.avatar'
      },
      {
        path: 'teamInfo.rosters.players.user',
        select: 'username profile.displayName profile.avatar'
      },
      {
        path: 'teamInfo.staff.user',
        select: 'username profile.displayName profile.avatar'
      }
    ]);
    
    // Filter out inactive staff members after population, but keep those with pending leave requests
    if (this.teamInfo && this.teamInfo.staff) {
      this.teamInfo.staff = this.teamInfo.staff.filter(staff => 
        staff.isActive || staff.leaveRequestStatus === 'pending'
      );
    }
    
    // Filter out inactive roster players after population
    if (this.teamInfo && this.teamInfo.rosters) {
      this.teamInfo.rosters.forEach(roster => {
        if (roster.players) {
          roster.players = roster.players.filter(player => player.isActive);
        }
      });
    }
  }
  return this;
};

module.exports = mongoose.model('User', userSchema);
