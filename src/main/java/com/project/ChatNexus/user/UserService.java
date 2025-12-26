package com.project.ChatNexus.user;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class UserService {
    private final UserRepository userRepository;

    public void saveUser(User user) {
        var storedUser = userRepository.findByUsername(user.getUsername())
                .orElse(null);

        if (storedUser != null) {
            storedUser.setStatus(Status.ONLINE);
            storedUser.setLastSeen(LocalDateTime.now());
            userRepository.save(storedUser);
        }
    }

    public void disconnect(User user) {
        var storedUser = userRepository.findByUsername(user.getUsername())
                .orElse(null);

        if (storedUser != null) {
            storedUser.setStatus(Status.OFFLINE);
            storedUser.setLastSeen(LocalDateTime.now());
            userRepository.save(storedUser);
        }
    }

    public List<User> findConnectedUser() {
        return userRepository.findAllByStatus(Status.ONLINE);
    }

    public List<User> findAllUsers() {
        return userRepository.findAll();
    }

    public Optional<User> findByUsername(String username) {
        return userRepository.findByUsername(username);
    }

    public List<User> searchUsers(String query) {
        return userRepository.findByUsernameContainingIgnoreCase(query);
    }

    public boolean isUserOnline(String username) {
        return userRepository.findByUsername(username)
                .map(user -> user.getStatus() == Status.ONLINE)
                .orElse(false);
    }
}
