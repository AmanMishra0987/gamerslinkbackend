const express = require('express');
const router = express.Router();
const { 
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
  broadcastSchedule,
  updateMatchResult, 
  startMatch, 
  getTournamentParticipants, 
  removeParticipant, 
  assignParticipantToGroup, 
  updateRoundSettings, 
  recreateGroups,
  submitGroupResults,
  getRoundResults,
  qualifyTeams,
  createNextRoundGroups,
  getQualificationStatus,
  saveQualificationSettings,
  getQualificationSettings,
  createRound2,
  autoAssignRound2
} = require('../controllers/tournamentController');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Tournament CRUD operations
router.route('/')
  .get(getTournaments)
  .post(createTournament);

router.route('/:id')
  .get(getTournament)
  .put(updateTournament)
  .delete(deleteTournament);

// Get tournament by name and host username
router.get('/by-name/:tournamentName/:hostUsername', getTournamentByName);

// Tournament participation
router.post('/:id/join', joinTournament);
router.post('/:id/leave', leaveTournament);
router.post('/:id/leave-team', leaveTournamentAsTeam);

// Tournament management (host only)
router.post('/:id/assign-groups', autoAssignGroups);
router.post('/:id/start', startTournament);
router.post('/:id/schedule-matches', scheduleMatches);
router.put('/:id/cancel', cancelTournament);

// Messaging system
router.post('/:id/tournament-message', sendTournamentMessage);
router.post('/:id/group-message', sendGroupMessage);
router.get('/:id/tournament-messages', getTournamentMessages);
router.get('/:id/group-messages', getGroupMessages);
router.delete('/:id/tournament-message/:messageIndex', deleteTournamentMessage);
router.delete('/:id/group-message/:groupId/:round/:messageIndex', deleteGroupMessage);

// Match management (host only)
router.post('/:id/start-match', startMatch);
router.post('/:id/update-match-result', updateMatchResult);

// Participant management
router.get('/:id/participants', getTournamentParticipants);
router.post('/:id/remove-participant', removeParticipant);
router.post('/:id/assign-participant', assignParticipantToGroup);

// Round settings management
router.put('/:id/round-settings', updateRoundSettings);
router.post('/:id/recreate-groups', recreateGroups);

// Schedule management (host only)
router.post('/:id/schedule', createMatchSchedule);
router.get('/:id/schedule', getTournamentSchedule);
router.put('/:id/schedule/:matchId', updateMatchSchedule);
router.delete('/:id/schedule/:matchId', deleteMatchFromSchedule);
router.delete('/:id/schedule/round/:round', deleteRoundSchedule);
router.put('/:id/schedule-config', configureScheduleSettings);
router.post('/:id/broadcast-schedule', broadcastSchedule);

// Results and Qualification management (host only)
router.post('/:id/results', submitGroupResults);
router.get('/:id/results/:round', getRoundResults);
router.post('/:id/qualify', qualifyTeams);
router.post('/:id/next-round', createNextRoundGroups);
router.get('/:id/qualification-status', getQualificationStatus);
router.post('/:id/qualification-settings', saveQualificationSettings);
router.get('/:id/qualification-settings', getQualificationSettings);
router.post('/:id/create-round-2', createRound2);
router.post('/:id/auto-assign-round-2', autoAssignRound2);

module.exports = router;
