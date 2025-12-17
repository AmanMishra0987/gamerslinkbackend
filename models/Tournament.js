const mongoose = require('mongoose');

const tournamentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  game: {
    type: String,
    required: true,
    enum: ['BGMI', 'Valorant', 'Free Fire', 'Call of Duty Mobile']
  },
  mode: {
    type: String,
    required: false,
    enum: ['Battle Royale', 'Deathmatch', '5v5', 'Solo']
  },
  format: {
    type: String,
    required: true,
    enum: ['Solo', 'Duo', 'Squad', '5v5']
  },

  status: {
    type: String,
    required: true,
    enum: ['Upcoming', 'Registration Open', 'Ongoing', 'Completed', 'Cancelled'],
    default: 'Upcoming'
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  registrationDeadline: {
    type: Date,
    required: true
  },
  location: {
    type: String,
    default: 'Online'
  },
  timezone: {
    type: String,
    default: 'UTC'
  },
  prizePool: {
    type: Number,
    default: 0
  },
  entryFee: {
    type: Number,
    default: 0
  },
  totalSlots: {
    type: Number,
    required: true,
    min: 4
  },
  teamsPerGroup: {
    type: Number,
    required: true,
    min: 2,
    max: 32
  },
  numberOfGroups: {
    type: Number,
    required: true,
    min: 1
  },
  prizePoolType: {
    type: String,
    required: true,
    enum: ['with_prize', 'without_prize'],
    default: 'with_prize'
  },
  currentRound: {
    type: Number,
    default: 1
  },
  totalRounds: {
    type: Number,
    default: 1
  },
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  teams: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  groups: [{
    name: String,
    round: {
      type: Number,
      default: 1
    },
    groupLetter: String,
    participants: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    broadcastChannelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    }
  }],
  banner: {
    type: String,
    default: null
  },
  rules: [{
    type: String
  }],
  // Group-wise messaging system
  groupMessages: [{
    groupId: String,
    round: {
      type: Number,
      default: 1
    },
    messages: [{
      sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      message: String,
      timestamp: {
        type: Date,
        default: Date.now
      },
      type: {
        type: String,
        enum: ['text', 'announcement', 'system'],
        default: 'text'
      }
    }]
  }],
  
  // Tournament-wide messaging system
  tournamentMessages: [{
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    message: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    type: {
      type: String,
      enum: ['text', 'announcement', 'system'],
      default: 'text'
    }
  }],
  matches: [{
    round: Number,
    groupId: String,
    groupName: String,
    team1: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false
    },
    team2: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false
    },
    winner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['Scheduled', 'In Progress', 'Completed', 'Cancelled'],
      default: 'Scheduled'
    },
    scheduledTime: Date,
    scheduledDate: String, // YYYY-MM-DD format for easy filtering
    scheduledTimeString: String, // HH:MM format for display
    matchDuration: {
      type: Number,
      default: 30 // minutes
    },
    venue: {
      type: String,
      default: 'Online'
    },
    description: String,
    result: {
      team1Score: Number,
      team2Score: Number
    },
    // Schedule management fields
    isRescheduled: {
      type: Boolean,
      default: false
    },
    originalScheduledTime: Date,
    rescheduleReason: String,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  
  // Schedule configuration
  scheduleConfig: {
    defaultMatchDuration: {
      type: Number,
      default: 30 // minutes
    },
    timeSlots: [{
      startTime: String, // HH:MM format
      endTime: String,   // HH:MM format
      isActive: {
        type: Boolean,
        default: true
      }
    }],
    availableDates: [{
      date: String, // YYYY-MM-DD format
      isActive: {
        type: Boolean,
        default: true
      },
      maxMatches: {
        type: Number,
        default: 10
      }
    }],
    timezone: {
      type: String,
      default: 'Asia/Kolkata'
    }
  },
  
  // Results and Qualification System
  groupResults: [{
    round: {
      type: Number,
      required: true
    },
    groupId: {
      type: String,
      required: true
    },
    groupName: {
      type: String,
      required: true
    },
    teams: [{
      teamId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      teamName: {
        type: String,
        required: true
      },
      teamLogo: {
        type: String,
        default: null
      },
      wins: {
        type: Number,
        default: 0
      },
      finishPoints: {
        type: Number,
        default: 0
      },
      positionPoints: {
        type: Number,
        default: 0
      },
      totalPoints: {
        type: Number,
        default: 0
      },
      rank: {
        type: Number,
        default: 0
      },
      qualified: {
        type: Boolean,
        default: false
      }
    }],
    submittedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  qualifications: [{
    round: {
      type: Number,
      required: true
    },
    qualifiedTeams: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    qualificationCriteria: {
      type: Number,
      default: 8 // teams that qualify per group
    },
    totalQualified: {
      type: Number,
      default: 0
    },
    qualifiedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  roundSettings: [{
    round: {
      type: Number,
      required: true
    },
    teamsPerGroup: {
      type: Number,
      required: true
    },
    qualificationCriteria: {
      type: Number,
      default: 8
    },
    totalGroups: {
      type: Number,
      required: true
    },
    totalTeams: {
      type: Number,
      required: true
    }
  }],
  
  qualificationSettings: {
    teamsPerGroup: {
      type: Number,
      default: 8
    },
    nextRoundTeamsPerGroup: {
      type: Number,
      default: 16
    }
  },
  
  winners: [{
    position: Number,
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    prize: Number
  }]
}, {
  timestamps: true
});

// Indexes for better performance
tournamentSchema.index({ status: 1, startDate: 1 });
tournamentSchema.index({ host: 1 });
tournamentSchema.index({ game: 1, format: 1 });

module.exports = mongoose.model('Tournament', tournamentSchema);
